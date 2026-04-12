# Cuemath AI Tutor Screener

An AI-powered voice interview application that screens tutor candidates for Cuemath. The app conducts a structured conversation, evaluates responses across 5 dimensions, and generates a detailed assessment report — all automatically.

---

## Live Demo

- **Frontend:** https://ai-tutor-screener-1.vercel.app
- **Backend API:** https://ai-tutor-screener-1-backend.onrender.com

---

## What It Does

1. Candidate enters their name and starts the interview
2. Aria (the AI interviewer) speaks the opening question aloud
3. Mic opens automatically — candidate speaks their answer
4. After 4 seconds of silence, the answer is sent automatically
5. Groq Whisper transcribes the audio
6. Groq LLaMA generates Aria's next question
7. This continues for 4–5 questions
8. After the interview, a structured assessment report is generated
9. Report shows scores, evidence quotes, strengths, concerns, and a hiring recommendation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, deployed on Vercel |
| Backend | FastAPI (Python), deployed on Render |
| Speech-to-Text | Groq Whisper (`whisper-large-v3`) |
| AI Conversation | Groq LLaMA (`llama-3.3-70b-versatile`) |
| AI Assessment | Groq LLaMA (`llama-3.3-70b-versatile`) |
| Text-to-Speech | Browser `speechSynthesis` (free, no server) |
| Silence Detection | Web Audio API (`AnalyserNode`) + `setInterval` |

---

## Project Structure

```
ai-tutor-screener/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── models.py          # Pydantic models — SessionState, ChatRequest, AssessRequest
│   ├── interviewer.py     # Aria's system prompt and opening message
│   ├── assessor.py        # Assessment logic, scoring, fix_report()
│   └── main.py            # FastAPI routes — /session/start, /transcribe, /chat, /assess
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── vercel.json
    └── src/
        ├── main.jsx
        ├── index.css
        ├── App.jsx
        ├── ErrorBoundary.jsx
        ├── utils/
        │   └── api.js                  # API calls + browser TTS
        ├── hooks/
        │   └── useAudioRecorder.js     # Mic recording + Web Audio analyser
        └── components/
            ├── OrbAnimation.jsx        # Animated orb — speaking/listening/thinking states
            ├── WelcomeScreen.jsx       # Name entry screen
            ├── InterviewScreen.jsx     # Main interview UI + silence detection
            ├── TranscriptPanel.jsx     # Live transcript bubbles
            └── ReportScreen.jsx        # Assessment report + transcript tab
```

---

## Assessment Dimensions

Every candidate is scored 1–10 on five dimensions:

| Dimension | Weight | What It Measures |
|---|---|---|
| Communication Clarity | 20% | Clear, structured, easy to follow responses |
| Warmth & Empathy | 25% | Genuine care for students, emotional intelligence |
| Simplification Ability | 25% | Breaking down concepts for children, use of analogies |
| Patience & Adaptability | 20% | Handling struggling students, adapting explanations |
| English Fluency | 10% | Grammar, vocabulary, natural expression |

**Overall score** is a weighted average of the five dimensions.

**Recommendation logic:**
- `Advance` — overall ≥ 7 AND full interview completed
- `Hold` — overall 5–6 OR interview not fully completed
- `Decline` — overall < 5 OR no real responses recorded

> Candidates who finish the interview early can never receive an "Advance" recommendation regardless of their scores.

---

## Environment Variables

### Render (Backend)

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key — used for Whisper STT and LLaMA chat/assessment |

### Vercel (Frontend)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL e.g. `https://ai-tutor-screener-1-backend.onrender.com` |
| `VITE_WS_URL` | WebSocket URL e.g. `wss://ai-tutor-screener-1-backend.onrender.com` |

---

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file:
```
GROQ_API_KEY=gsk_...
```

Run the server:
```bash
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
```

Create a `.env.local` file:
```
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

Run the dev server:
```bash
npm run dev
```

---

## Deployment

### Backend → Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo, set root directory to `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
5. Add environment variable: `GROQ_API_KEY`

### Frontend → Vercel

1. Import your GitHub repo on [vercel.com](https://vercel.com)
2. Set root directory to `frontend/`
3. Framework preset: `Vite`
4. Add environment variables: `VITE_API_URL` and `VITE_WS_URL`

---

## How Silence Detection Works

The mic does not require manual input — it auto-sends after silence:

1. After `startRecording()` succeeds, a `setInterval` runs every 100ms
2. Each tick reads the raw audio level directly from the Web Audio `AnalyserNode`
3. Any level above `0.095` counts as speech — `lastSpeechTime` is updated
4. When the level drops below `0.095` after speech has been detected, silence is counted
5. At 2 seconds of silence — an orange warning bar appears
6. At 4 seconds of silence — the recording stops and the answer is sent automatically

Background noise is handled by the threshold: since ambient noise typically stays below `0.095`, only actual speech resets the silence timer.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/session/start` | Create a new interview session |
| `GET` | `/session/{session_id}` | Get session transcript and status |
| `POST` | `/transcribe` | Transcribe audio via Groq Whisper |
| `POST` | `/chat` | Send candidate message, get Aria's reply |
| `POST` | `/assess` | Generate assessment report for the session |
| `GET` | `/health` | Health check |

---

## Security

- API keys are stored as environment variables — never hardcoded
- Error logs only print `type(e).__name__` — never the full error message which could contain key details
- CORS is open for development — restrict `allow_origins` to your frontend domain in production

---

## Getting a Groq API Key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to **API Keys** → **Create API Key**
4. Copy the key starting with `gsk_...`

The free tier includes generous limits suitable for interview screening workloads.

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com/)
- [Groq](https://console.groq.com/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
