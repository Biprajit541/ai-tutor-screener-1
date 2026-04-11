from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class Role(str, Enum):
    assistant = "assistant"
    user = "user"

class Message(BaseModel):
    role: Role
    content: str

class SessionState(BaseModel):
    session_id: str
    candidate_name: str
    messages: List[Message] = []
    question_count: int = 0
    is_complete: bool = False
    transcript: List[dict] = []

class ChatRequest(BaseModel):
    session_id: str
    user_message: str

class AssessRequest(BaseModel):
    session_id: str

class AssessmentDimension(BaseModel):
    score: int  # 1-10
    label: str
    evidence: str
    verdict: str  # "Strong" | "Adequate" | "Weak"

class AssessmentReport(BaseModel):
    candidate_name: str
    overall_score: int
    recommendation: str  # "Advance" | "Hold" | "Decline"
    recommendation_reason: str
    dimensions: dict  # keyed by dimension name
    strengths: List[str]
    concerns: List[str]
    standout_quote: str
    session_id: str