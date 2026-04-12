import json
import os
from groq import Groq

ASSESSMENT_PROMPT = """You are a strict, fair evaluator reviewing a Cuemath tutor screening interview.

IMPORTANT RULES:
- If the transcript has NO candidate responses, score everything 1 and recommend Decline
- If answers are very short or vague, score low (3-4)
- Only score 8+ if there is clear, specific, impressive evidence in the transcript
- Be honest and critical — this determines who gets hired to teach children
- Evidence MUST be a real quote or close paraphrase from the transcript, not invented

Evaluate on these 5 dimensions. Score each 1-10:

1. Communication Clarity (20% weight)
   - 8-10: Clear, structured, easy to follow with no confusion
   - 5-7: Mostly clear but some vague parts
   - 1-4: Unclear, rambling, hard to follow

2. Warmth & Empathy (25% weight)
   - 8-10: Genuinely warm, shows real care for students with specific examples
   - 5-7: Some warmth but surface level
   - 1-4: Cold, robotic, no emotional connection shown

3. Simplification Ability (25% weight)
   - 8-10: Excellent analogies, breaks complex things down simply and creatively
   - 5-7: Adequate explanations but not memorable
   - 1-4: Cannot simplify, uses jargon or too complex language

4. Patience & Adaptability (20% weight)
   - 8-10: Specific strategies for struggling students, shows real patience
   - 5-7: General patience mentioned but no specifics
   - 1-4: No evidence of patience or adaptive teaching

5. English Fluency (10% weight)
   - 8-10: Natural, fluent, varied vocabulary
   - 5-7: Understandable but some grammatical issues
   - 1-4: Significant fluency issues that would affect teaching

Scoring guide:
- No transcript / no candidate responses → all scores = 1, recommendation = Decline
- Very short interview (1-2 exchanges) → scores 3-5, recommendation = Hold or Decline
- Full interview with specific examples → scores 6-9 based on quality

overall_score = (clarity×0.20) + (warmth×0.25) + (simplification×0.25) + (patience×0.20) + (fluency×0.10)
recommendation:
- "Advance" ONLY if overall_score >= 7 AND there is clear specific evidence
- "Hold" if overall_score 5-6.9
- "Decline" if overall_score < 5 OR no real responses in transcript

Return ONLY this exact JSON structure with no extra text:
{
  "dimensions": {
    "communication_clarity": {"score": 0, "label": "Communication Clarity", "evidence": "direct quote from transcript", "verdict": "Weak"},
    "warmth_empathy": {"score": 0, "label": "Warmth & Empathy", "evidence": "direct quote from transcript", "verdict": "Weak"},
    "simplification_ability": {"score": 0, "label": "Simplification Ability", "evidence": "direct quote from transcript", "verdict": "Weak"},
    "patience_adaptability": {"score": 0, "label": "Patience & Adaptability", "evidence": "direct quote from transcript", "verdict": "Weak"},
    "english_fluency": {"score": 0, "label": "English Fluency", "evidence": "direct quote from transcript", "verdict": "Weak"}
  },
  "overall_score": 0,
  "recommendation": "Decline",
  "recommendation_reason": "Two sentences explaining the recommendation.",
  "strengths": [],
  "concerns": ["List at least one concern"],
  "standout_quote": "Best quote from candidate, or empty string if none"
}"""

DIMENSION_LABELS = {
    "communication_clarity":  "Communication Clarity",
    "warmth_empathy":         "Warmth & Empathy",
    "simplification_ability": "Simplification Ability",
    "patience_adaptability":  "Patience & Adaptability",
    "english_fluency":        "English Fluency",
}

def has_real_content(transcript: list) -> bool:
    candidate_lines = [
        t for t in transcript
        if isinstance(t, dict)
        and t.get('speaker') != 'Aria'
        and len((t.get('text') or '').strip()) > 10
    ]
    return len(candidate_lines) >= 1

def count_candidate_responses(transcript: list) -> int:
    return len([
        t for t in transcript
        if isinstance(t, dict)
        and t.get('speaker') != 'Aria'
        and len((t.get('text') or '').strip()) > 10
    ])

def fix_report(result: dict, has_content: bool, interview_complete: bool) -> dict:
    dims = result.get("dimensions", {})

    for key, label in DIMENSION_LABELS.items():
        if key not in dims:
            dims[key] = {"score": 1, "label": label, "evidence": "No data available.", "verdict": "Weak"}
        dim = dims[key]
        dim["label"] = label
        try:
            score = int(float(str(dim.get("score", 1))))
            score = max(1, min(10, score))
        except:
            score = 1
        dim["score"] = score
        if not has_content:
            dim["score"] = min(dim["score"], 3)
        s = dim["score"]
        dim["verdict"] = "Strong" if s >= 8 else "Adequate" if s >= 5 else "Weak"
        evidence = str(dim.get("evidence", "")).strip()
        if not evidence or evidence.lower() in ["n/a", "none", "no data", ""]:
            dim["evidence"] = "No specific quote available from this candidate."

    result["dimensions"] = dims

    weights = {
        "communication_clarity":  0.20,
        "warmth_empathy":         0.25,
        "simplification_ability": 0.25,
        "patience_adaptability":  0.20,
        "english_fluency":        0.10,
    }
    weighted = sum(dims[k]["score"] * w for k, w in weights.items() if k in dims)
    result["overall_score"] = round(weighted)

    if not has_content:
        result["overall_score"] = min(result["overall_score"], 3)

    score = result["overall_score"]

    if not has_content:
        result["recommendation"] = "Decline"
        result["recommendation_reason"] = (
            "The candidate did not provide any responses during the interview. "
            "A full interview must be completed before any assessment can be made."
        )
    elif not interview_complete:
        if score >= 7:
            result["recommendation"] = "Hold"
            result["recommendation_reason"] = (
                "The candidate showed promising responses but did not complete all interview questions. "
                "A full interview covering all questions is required before advancing to the next round."
            )
        elif score >= 5:
            result["recommendation"] = "Hold"
            result["recommendation_reason"] = (
                "The candidate did not complete all interview questions. "
                "Please schedule a full interview before making a hiring decision."
            )
        else:
            result["recommendation"] = "Decline"
            result["recommendation_reason"] = (
                "The candidate did not complete the interview and responses were insufficient. "
                "A complete interview is required for proper evaluation."
            )
        concerns = result.get("concerns", [])
        if not isinstance(concerns, list):
            concerns = []
        concerns.insert(0, "Interview was not fully completed — not all questions were answered.")
        result["concerns"] = concerns
    else:
        if score >= 7:
            result["recommendation"] = "Advance"
        elif score >= 5:
            result["recommendation"] = "Hold"
        else:
            result["recommendation"] = "Decline"

        if not result.get("recommendation_reason"):
            result["recommendation_reason"] = "Assessment based on candidate responses during the full interview."

    if not isinstance(result.get("strengths"), list):
        result["strengths"] = []
    if not isinstance(result.get("concerns"), list):
        result["concerns"] = []

    if not has_content:
        result["strengths"] = []
        result["concerns"] = ["Candidate did not complete the interview — no responses to evaluate."]
        result["standout_quote"] = ""

    return result


async def generate_assessment(
    transcript: list,
    candidate_name: str,
    interview_complete: bool = False
) -> dict:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    content_exists = has_real_content(transcript)
    response_count = count_candidate_responses(transcript)

    transcript_text = "\n".join([
        f"{t['speaker']}: {t['text']}"
        for t in transcript
        if isinstance(t, dict) and t.get('speaker') and t.get('text')
    ])

    if not transcript_text.strip() or not content_exists:
        result = {
            "dimensions": {
                key: {"score": 1, "label": label, "evidence": "No candidate responses available.", "verdict": "Weak"}
                for key, label in DIMENSION_LABELS.items()
            },
            "overall_score": 1,
            "recommendation": "Decline",
            "recommendation_reason": "No candidate responses were recorded. The interview must be completed before an assessment can be generated.",
            "strengths": [],
            "concerns": ["Candidate did not complete the interview — no responses to evaluate."],
            "standout_quote": ""
        }
        result["candidate_name"] = candidate_name
        result["interview_complete"] = interview_complete
        return result

    completion_note = (
        "NOTE: The candidate completed all interview questions."
        if interview_complete else
        f"NOTE: The candidate only answered {response_count} question(s) and did NOT complete the full interview. "
        "They pressed 'Finish Interview' early. Do NOT recommend Advance."
    )

    prompt = f"""Candidate Name: {candidate_name}

{completion_note}

Interview Transcript:
{transcript_text}

Evaluate this candidate strictly and honestly based ONLY on what they actually said.
Return the JSON assessment now:"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": ASSESSMENT_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=2000
        )
        raw = response.choices[0].message.content.strip()

        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    raw = part
                    break

        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

        result = json.loads(raw)
        result = fix_report(result, content_exists, interview_complete)
        result["candidate_name"] = candidate_name
        result["interview_complete"] = interview_complete
        return result

    except Exception as e:
        print(f"Assessment error: {type(e).__name__}")  # only logs error type, not content
        result = {
            "dimensions": {
                key: {"score": 1, "label": label, "evidence": "Assessment could not be completed.", "verdict": "Weak"}
                for key, label in DIMENSION_LABELS.items()
            },
            "overall_score": 1,
            "recommendation": "Decline",
            "recommendation_reason": "The assessment could not be generated due to a technical error. Please retry.",
            "strengths": [],
            "concerns": ["Technical error during assessment generation."],
            "standout_quote": ""
        }
        result = fix_report(result, content_exists, interview_complete)
        result["candidate_name"] = candidate_name
        result["interview_complete"] = interview_complete
        return result
