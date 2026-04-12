import os
import uuid
import base64
import tempfile
import asyncio
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai
from groq import Groq
import edge_tts

from models import SessionState, Message, Role, ChatRequest, AssessRequest
from interviewer import get_opening_message, SYSTEM_PROMPT
from assessor import generate_assessment

load_dotenv()

app = FastAPI(title="AI Tutor Screener API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

sessions: Dict[str, SessionState] = {}
websocket_connections: Dict[str, WebSocket] = {}

# ── Session ───────────────────────────────────────────────────────────────────

@app.post("/session/start")
async def start_session(body: dict):
    candidate_name = body.get("candidate_name", "").strip()
    if not candidate_name:
        raise HTTPException(400, "candidate_name is required")
    session_id = str(uuid.uuid4())
    opening = get_opening_message(candidate_name)
    session = SessionState(
        session_id=session_id,
        candidate_name=candidate_name,
        messages=[Message(role=Role.assistant, content=opening)],
        transcript=[{"speaker": "Aria", "text": opening}]
    )
    sessions[session_id] = session
    return {"session_id": session_id, "opening_message": opening}

@app.get("/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")
    s = sessions[session_id]
    return {"session_id": session_id, "transcript": s.transcript, "is_complete": s.is_complete}

# ── Transcribe ────────────────────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    session_id: str = Form(default="")
):
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) < 500:
            return {"text": ""}

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                transcription = groq_client.audio.transcriptions.create(
                    file=("audio.webm", f, "audio/webm"),
                    model="whisper-large-v3",
                    language="en",
                    response_format="text"
                )
            text = str(transcription).strip()
            return {"text": text}
        finally:
            try: os.unlink(tmp_path)
            except: pass

    except Exception as e:
        print(f"Transcription error: {e}")
        raise HTTPException(500, f"Transcription failed: {str(e)}")

# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(request: ChatRequest):
    if request.session_id not in sessions:
        raise HTTPException(404, "Session not found")

    session = sessions[request.session_id]
    if session.is_complete:
        raise HTTPException(400, "Interview already complete")

    session.messages.append(Message(role=Role.user, content=request.user_message))
    session.transcript.append({"speaker": session.candidate_name, "text": request.user_message})
    session.question_count += 1

    # Build history — Gemini requires alternating user/model turns
    history = []
    for msg in session.messages[:-1]:
        role = "user" if msg.role.value == "user" else "model"
        history.append({"role": role, "parts": [msg.content]})

    # Remove leading model turn if present
    while history and history[0]["role"] == "model":
        history = history[1:]

    # Ensure alternating turns — merge consecutive same-role messages
    clean_history = []
    for turn in history:
        if clean_history and clean_history[-1]["role"] == turn["role"]:
            clean_history[-1]["parts"][0] += " " + turn["parts"][0]
        else:
            clean_history.append({"role": turn["role"], "parts": [turn["parts"][0]]})

    try:
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT
        )
        chat_session = model.start_chat(history=clean_history)
        response = chat_session.send_message(request.user_message)
        ai_reply = response.text.strip()
    except Exception as e:
        print(f"Gemini error: {e}")
        raise HTTPException(500, f"AI error: {str(e)}")

    is_complete = "[INTERVIEW_COMPLETE]" in ai_reply
    clean_reply = ai_reply.replace("[INTERVIEW_COMPLETE]", "").strip()

    session.messages.append(Message(role=Role.assistant, content=clean_reply))
    session.transcript.append({"speaker": "Aria", "text": clean_reply})
    session.is_complete = is_complete

    return {"reply": clean_reply, "is_complete": is_complete}

# ── TTS ───────────────────────────────────────────────────────────────────────

async def run_tts(text: str) -> bytes:
    voices = [
        ("en-US-JennyNeural", "-5%"),
        ("en-US-AriaNeural", "-3%"),
        ("en-GB-SoniaNeural", "-5%"),
    ]
    last_err = None
    for voice, rate in voices:
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
                chunks = []
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        chunks.append(chunk["data"])
                if chunks:
                    return b"".join(chunks)
            except Exception as e:
                last_err = e
                print(f"TTS failed ({voice}, attempt {attempt+1}): {e}")
                await asyncio.sleep(1)
    raise Exception(f"All TTS voices failed: {last_err}")

@app.post("/tts")
async def tts(body: dict):
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(400, "text required")
    try:
        audio_bytes = await run_tts(text)
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {"audio_b64": audio_b64}
    except Exception as e:
        print(f"TTS endpoint error: {e}")
        raise HTTPException(500, f"TTS failed: {str(e)}")

# ── Assess ────────────────────────────────────────────────────────────────────

@app.post("/assess")
async def assess_candidate(request: AssessRequest):
    if request.session_id not in sessions:
        raise HTTPException(404, "Session not found")
    session = sessions[request.session_id]
    try:
        report = await generate_assessment(
            transcript=session.transcript,
            candidate_name=session.candidate_name
        )
        report["session_id"] = request.session_id
        return report
    except Exception as e:
        print(f"Assessment error: {e}")
        raise HTTPException(500, f"Assessment failed: {str(e)}")

# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    websocket_connections[session_id] = websocket
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_connections.pop(session_id, None)

@app.get("/health")
async def health():
    return {"status": "ok"}
