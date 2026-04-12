import json
import os
import httpx

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
- strengths: 2-3 bullet points as strings
- concerns: 1-2 bullet points as strings (or empty array if Advance)
- standout_quote: The single best quote from the candidate

Respond ONLY with valid JSON. No markdown. No backticks. No extra text before or after the JSON object."""

EMPTY_REPORT = {
    "dimensions": {
        "communication_clarity": {"score": 5, "label": "Communication Clarity", "evidence": "Insufficient data", "verdict": "Adequate"},
        "warmth_empathy": {"score": 5, "label": "Warmth & Empathy", "evidence": "Insufficient data", "verdict": "Adequate"},
        "simplification_ability": {"score": 5, "label": "Simplification Ability", "evidence": "Insufficient data", "verdict": "Adequate"},
        "patience_adaptability": {"score": 5, "label": "Patience & Adaptability", "evidence": "Insufficient data", "verdict": "Adequate"},
        "english_fluency": {"score": 5, "label": "English Fluency", "evidence": "Insufficient data", "verdict": "Adequate"}
    },
    "overall_score": 5,
    "recommendation": "Hold",
    "recommendation_reason": "Insufficient interview data to make a confident assessment. The candidate should be re-interviewed.",
    "strengths": ["Participated in the screening process"],
    "concerns": ["Interview was too short to evaluate properly"],
    "standout_quote": "No significant quotes captured."
}

async def generate_assessment(transcript: list, candidate_name: str) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")

    transcript_text = "\n".join([
        f"{t['speaker']}: {t['text']}"
        for t in transcript
        if isinstance(t, dict) and t.get('speaker') and t.get('text')
    ])

    if not transcript_text.strip():
        result = EMPTY_REPORT.copy()
        result["candidate_name"] = candidate_name
        return result

    prompt = f"{ASSESSMENT_PROMPT}\n\nCandidate Name: {candidate_name}\n\nInterview Transcript:\n{transcript_text}"

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2000}
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()

    # Strip markdown fences if present
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                raw = part
                break

    result = json.loads(raw.strip())
    result["candidate_name"] = candidate_name
    return result
