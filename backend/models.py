from pydantic import BaseModel
from typing import List

class SessionState(BaseModel):
    session_id: str
    candidate_name: str
    messages: List[dict] = []
    question_count: int = 0
    is_complete: bool = False
    transcript: List[dict] = []

class ChatRequest(BaseModel):
    session_id: str
    user_message: str

class AssessRequest(BaseModel):
    session_id: str
