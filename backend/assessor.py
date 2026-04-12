import json
import google.generativeai as genai
import os

ASSESSMENT_PROMPT = """You are an expert evaluator reviewing a Cuemath tutor screening interview transcript.

Evaluate the candidate on these 5 dimensions. Score each 1-10.

Dimensions:
1. Communication Clarity - Are their responses clear, structured, and easy to follow?
2. Warmth & Empathy - Do they show genuine care for students? Emotional intelligence?
3. Simplification Ability - Can they break down concepts for a child? Use analogies?
4. Patience & Adaptability - How do they handle struggling students, frustration, mistakes?
5. English Fluency - Grammar, vocabulary, natural expression (not accent, fluency).

For each dimension provide:
- score (1-10)
- evidence (a specific quote or paraphrase from the transcript)
- verdict: "Strong" (8-10), "Adequate" (5-7), or "Weak" (1-4)

Overall:
- overall_score: weighted average (clarity 20%, warmth 25%, simplification 25%, patience 20%, fluency 10%)
- recommendation: "Advance" (overall >= 7), "Hold" (5-6.9), or "Decline" (< 5)
- recommendation_reason: 2-sentence explanation
- strengths: 2-3 bullet points
- concerns: 1-2 bullet points (or empty array if Advance)
- standout_quote: The single best quote from the candidate

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "dimensions": {
    "communication_clarity": {"score": 0, "label": "Communication Clarity", "evidence": "", "verdict": ""},
    "warmth_empathy": {"score": 0, "label": "Warmth & Empathy", "evidence": "", "verdict": ""},
    "simplification_ability": {"score": 0, "label": "Simplification Ability", "evidence": "", "verdict": ""},
    "patience_adaptability": {"score": 0, "label": "Patience & Adaptability", "evidence": "", "verdict": ""},
    "english_fluency": {"score": 0, "label": "English Fluency", "evidence": "", "verdict": ""}
  },
  "overall_score": 0,
  "recommendation": "",
  "recommendation_reason": "",
  "strengths": [],
  "concerns": [],
  "standout_quote": ""
}"""

async def generate_assessment(transcript: list, candidate_name: str) -> dict:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-1.5-flash")

    transcript_text = "\n".join([
        f"{t['speaker']}: {t['text']}" for t in transcript
    ])

    prompt = f"{ASSESSMENT_PROMPT}\n\nCandidate: {candidate_name}\n\nTranscript:\n{transcript_text}"

    response = model.generate_content(prompt)
    raw = response.text.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    result = json.loads(raw)
    result["candidate_name"] = candidate_name
    return result
