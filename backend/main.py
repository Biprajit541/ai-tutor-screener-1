import os
import uuid
import asyncio
from typing import Dict
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import google.generativeai as genai
import io

from models import SessionState, Message, Role, ChatRequest, AssessRequest
from interviewer import build_messages, get_opening_message, SYSTEM_PROMPT
from assessor import generate_assessment

load_dotenv()

app = FastAPI(title="AI Tutor Screener API")

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

sessions: Dict[str, SessionState] = {}
websocket_connections: Dict[str, WebSocket] = {}

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Session ────────────────────────────────────────────────────────────────────

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


# ── Chat ───────────────────────────────────────────────────────────────────────

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

    # Build Gemini chat history (exclude last user msg — it's sent as the new message)
    history = []
    for msg in session.messages[:-1]:  # all but the last (just-added) user message
        role = "user" if msg.role.value == "user" else "model"
        # Skip the opening assistant message as it becomes the first model turn
        history.append({"role": role, "parts": [msg.content]})

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT
    )

    # Gemini requires history to start with user turn — filter if needed
    if history and history[0]["role"] == "model":
        history = history[1:]

    chat_session = model.start_chat(history=history)
    response = chat_session.send_message(request.user_message)
    ai_reply = response.text.strip()

    is_complete = "[INTERVIEW_COMPLETE]" in ai_reply
    clean_reply = ai_reply.replace("[INTERVIEW_COMPLETE]", "").strip()

    session.messages.append(Message(role=Role.assistant, content=clean_reply))
    session.transcript.append({"speaker": "Aria", "text": clean_reply})
    session.is_complete = is_complete

    if request.session_id in websocket_connections:
        try:
            ws = websocket_connections[request.session_id]
            await ws.send_json({"type": "ai_response", "text": clean_reply, "is_complete": is_complete})
        except Exception:
            pass

    return {"reply": clean_reply, "is_complete": is_complete}


# ── Assessment ─────────────────────────────────────────────────────────────────

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


# ── WebSocket ──────────────────────────────────────────────────────────────────

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
