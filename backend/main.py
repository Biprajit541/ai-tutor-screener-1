import os
import uuid
import base64
import tempfile
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

# ── Transcribe via Groq Whisper ───────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    session_id: str = Form(default="")
):
    try:
        audio_bytes = await audio.read()
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        with open(tmp_path, "rb") as f:
            transcription = groq_client.audio.transcriptions.create(
                file=("audio.webm", f, "audio/webm"),
                model="whisper-large-v3",
                language="en",
                response_format="text"
            )
        os.unlink(tmp_path)
        return {"text": str(transcription).strip()}
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {str(e)}")

# ── Chat via Gemini ───────────────────────────────────────────────────────────

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

    history = []
    for msg in session.messages[:-1]:
        role = "user" if msg.role.value == "user" else "model"
        history.append({"role": role, "parts": [msg.content]})
    if history and history[0]["role"] == "model":
        history = history[1:]

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT
    )
    chat_session = model.start_chat(history=history)
    response = chat_session.send_message(request.user_message)
    ai_reply = response.text.strip()

    is_complete = "[INTERVIEW_COMPLETE]" in ai_reply
    clean_reply = ai_reply.replace("[INTERVIEW_COMPLETE]", "").strip()

    session.messages.append(Message(role=Role.assistant, content=clean_reply))
    session.transcript.append({"speaker": "Aria", "text": clean_reply})
    session.is_complete = is_complete

    return {"reply": clean_reply, "is_complete": is_complete}

# ── TTS via Edge TTS ──────────────────────────────────────────────────────────

@app.post("/tts")
async def tts(body: dict):
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(400, "text required")
    try:
        communicate = edge_tts.Communicate(
            text,
            voice="en-US-JennyNeural",
            rate="-5%",
            pitch="+0Hz"
        )
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        audio_bytes = b"".join(audio_chunks)
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {"audio_b64": audio_b64}
    except Exception as e:
        raise HTTPException(500, f"TTS failed: {str(e)}")

# ── Assessment ────────────────────────────────────────────────────────────────

@app.post("/assess")
async def assess_candidate(request: AssessRequest):
    if request.session_id not in sessions:
        raise HTTPException(404, "Session not found")
    session = sessions[request.session_id]
    report = await generate_assessment(
        transcript=session.transcript,
        candidate_name=session.candidate_name
    )
    report["session_id"] = request.session_id
    return report

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
