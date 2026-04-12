import json
import os
from groq import Groq

ASSESSMENT_PROMPT = """You are an expert evaluator reviewing a Cuemath tutor screening interview transcript.

Evaluate the candidate on EXACTLY these 5 dimensions. Score each 1-10.

Return a JSON object with EXACTLY this structure — no deviations:

{
  "dimensions": {
    "communication_clarity": {
      "score": 8,
      "label": "Communication Clarity",
      "evidence": "exact quote or paraphrase from transcript",
      "verdict": "Strong"
    },
    "warmth_empathy": {
      "score": 8,
      "label": "Warmth & Empathy",
      "evidence": "exact quote or paraphrase from transcript",
      "verdict": "Strong"
    },
    "simplification_ability": {
      "score": 8,
      "label": "Simplification Ability",
      "evidence": "exact quote or paraphrase from transcript",
      "verdict": "Strong"
    },
    "patience_adaptability": {
      "score": 8,
      "label": "Patience & Adaptability",
      "evidence": "exact quote or paraphrase from transcript",
      "verdict": "Strong"
    },
    "english_fluency": {
      "score": 8,
      "label": "English Fluency",
      "evidence": "exact quote or paraphrase from transcript",
      "verdict": "Strong"
    }
  },
  "overall_score": 8,
  "recommendation": "Advance",
  "recommendation_reason": "Two sentence explanation here.",
  "strengths": ["Strength one", "Strength two", "Strength three"],
  "concerns": ["Concern one"],
  "standout_quote": "The single most memorable quote from the candidate."
}

Rules:
- score must be an INTEGER between 1 and 10
- overall_score must be an INTEGER (weighted: clarity 20%, warmth 25%, simplification 25%, patience 20%, fluency 10%)
- verdict must be exactly "Strong" (8-10), "Adequate" (5-7), or "Weak" (1-4)
- recommendation must be exactly "Advance" (overall>=7), "Hold" (5-6), or "Decline" (<5)
- evidence must be a specific quote or close paraphrase from the actual transcript
- strengths must be an array of 2-3 strings
- concerns must be an array of strings (empty array [] if recommendation is Advance)
- DO NOT include any text outside the JSON object
- DO NOT use markdown or backticks"""

EMPTY_REPORT = {
    "dimensions": {
        "communication_clarity": {"score": 5, "label": "Communication Clarity", "evidence": "Insufficient interview data.", "verdict": "Adequate"},
        "warmth_empathy": {"score": 5, "label": "Warmth & Empathy", "evidence": "Insufficient interview data.", "verdict": "Adequate"},
        "simplification_ability": {"score": 5, "label": "Simplification Ability", "evidence": "Insufficient interview data.", "verdict": "Adequate"},
        "patience_adaptability": {"score": 5, "label": "Patience & Adaptability", "evidence": "Insufficient interview data.", "verdict": "Adequate"},
        "english_fluency": {"score": 5, "label": "English Fluency", "evidence": "Insufficient interview data.", "verdict": "Adequate"}
    },
    "overall_score": 5,
    "recommendation": "Hold",
    "recommendation_reason": "Insufficient interview data to make a confident assessment. The candidate should be re-interviewed.",
    "strengths": ["Participated in the screening process"],
    "concerns": ["Interview was too short to evaluate properly"],
    "standout_quote": "No significant quotes captured."
}

def fix_report(result: dict) -> dict:
    """Ensure all fields have correct types and required labels."""
    dims = result.get("dimensions", {})

    required_labels = {
        "communication_clarity": "Communication Clarity",
        "warmth_empathy": "Warmth & Empathy",
        "simplification_ability": "Simplification Ability",
        "patience_adaptability": "Patience & Adaptability",
        "english_fluency": "English Fluency"
    }

    for key, label in required_labels.items():
        if key not in dims:
            dims[key] = EMPTY_REPORT["dimensions"][key].copy()
        dim = dims[key]
        # Force correct label regardless of what model returned
        dim["label"] = label
        # Force score to int
        try:
            dim["score"] = int(float(str(dim.get("score", 5))))
        except:
            dim["score"] = 5
        # Ensure verdict is valid
        score = dim["score"]
        if score >= 8:
            dim["verdict"] = "Strong"
        elif score >= 5:
            dim["verdict"] = "Adequate"
        else:
            dim["verdict"] = "Weak"
        # Ensure evidence exists
        if not dim.get("evidence"):
            dim["evidence"] = "No specific quote captured."

    result["dimensions"] = dims

    # Calculate overall_score as proper integer from dimension scores
    weights = {
        "communication_clarity": 0.20,
        "warmth_empathy": 0.25,
        "simplification_ability": 0.25,
        "patience_adaptability": 0.20,
        "english_fluency": 0.10
    }
    weighted = sum(dims[k]["score"] * w for k, w in weights.items() if k in dims)
    result["overall_score"] = round(weighted)

    # Fix recommendation based on calculated score
    score = result["overall_score"]
    if score >= 7:
        result["recommendation"] = "Advance"
    elif score >= 5:
        result["recommendation"] = "Hold"
    else:
        result["recommendation"] = "Decline"

    # Ensure other fields
    if not result.get("recommendation_reason"):
        result["recommendation_reason"] = "Assessment based on interview responses."
    if not isinstance(result.get("strengths"), list):
        result["strengths"] = []
    if not isinstance(result.get("concerns"), list):
        result["concerns"] = []
    if not result.get("standout_quote"):
        result["standout_quote"] = ""

    return result

async def generate_assessment(transcript: list, candidate_name: str) -> dict:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    transcript_text = "\n".join([
        f"{t['speaker']}: {t['text']}"
        for t in transcript
        if isinstance(t, dict) and t.get('speaker') and t.get('text')
    ])

    if not transcript_text.strip():
        result = EMPTY_REPORT.copy()
        result["candidate_name"] = candidate_name
        return result

    prompt = f"Candidate Name: {candidate_name}\n\nInterview Transcript:\n{transcript_text}\n\nReturn the JSON assessment now:"

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": ASSESSMENT_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=2000
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown fences
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    raw = part
                    break

        # Find JSON object
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

        result = json.loads(raw)
        result = fix_report(result)
        result["candidate_name"] = candidate_name
        return result

    except Exception as e:
        print(f"Assessment error: {e}")
        result = fix_report(EMPTY_REPORT.copy())
        result["candidate_name"] = candidate_name
        return result
