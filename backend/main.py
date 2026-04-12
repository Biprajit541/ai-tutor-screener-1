import os
import uuid
import tempfile
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from groq import Groq
import httpx

from models import SessionState, ChatRequest, AssessRequest
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

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent"

sessions: Dict[str, SessionState] = {}
websocket_connections: Dict[str, WebSocket] = {}

# ── Gemini REST helper ────────────────────────────────────────────────────────

async def call_gemini(messages: list, system: str = "") -> str:
    """Call Gemini v1 REST API directly — bypasses broken Python library."""
    contents = []

    if system:
        # Inject system prompt as first user message (Gemini v1 doesn't have system role)
        contents.append({
            "role": "user",
            "parts": [{"text": f"[System Instructions]\n{system}\n\n[Begin Interview]"}]
        })
        contents.append({
            "role": "model",
            "parts": [{"text": "Understood. I am ready to begin the interview as Aria."}]
        })

    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.75,
            "maxOutputTokens": 300,
            "stopSequences": []
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload
        )
        if not resp.is_success:
            raise HTTPException(500, f"Gemini API error: {resp.status_code} {resp.text}")
        data = resp.json()

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as e:
        raise HTTPException(500, f"Unexpected Gemini response: {data}")

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
        messages=[{"role": "model", "content": opening}],
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
            return {"text": str(transcription).strip()}
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

    # Add user message
    session.messages.append({"role": "user", "content": request.user_message})
    session.transcript.append({"speaker": session.candidate_name, "text": request.user_message})
    session.question_count += 1

    # Build alternating history for Gemini
    # Ensure it starts with user and alternates properly
    history = []
    last_role = None
    for msg in session.messages:
        role = msg["role"]
        if role == last_role:
            # Merge consecutive same-role messages
            history[-1]["content"] += " " + msg["content"]
        else:
            history.append({"role": role, "content": msg["content"]})
            last_role = role

    try:
        ai_reply = await call_gemini(history, SYSTEM_PROMPT)
    except Exception as e:
        print(f"Gemini call error: {e}")
        raise HTTPException(500, f"AI error: {str(e)}")

    is_complete = "[INTERVIEW_COMPLETE]" in ai_reply
    clean_reply = ai_reply.replace("[INTERVIEW_COMPLETE]", "").strip()

    session.messages.append({"role": "model", "content": clean_reply})
    session.transcript.append({"speaker": "Aria", "text": clean_reply})
    session.is_complete = is_complete

    return {"reply": clean_reply, "is_complete": is_complete}

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
