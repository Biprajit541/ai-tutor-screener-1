# AI Tutor Screener

An AI-powered voice interview application that screens tutor candidates for Cuemath. The app conducts a structured conversation, evaluates responses across 5 dimensions, and generates a detailed assessment report — all automatically.

---

## Live Demo

- **Frontend:** https://ai-tutor-screener-1.vercel.app
- **Backend API:** https://ai-tutor-screener-1-backend.onrender.com/health

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

---

## Write-Up

### What I Built and Which Problem I Picked

I chose the AI-powered tutor screening problem. Manually screening tutor candidates at scale is slow, inconsistent, and expensive — every interviewer brings different standards, different follow-up questions, and different biases. The result is a hiring process that varies significantly from one candidate to the next.

I built an end-to-end voice interview application that replaces the initial screening round entirely. A candidate visits a link, enters their name, and is interviewed by Aria — an AI interviewer that speaks naturally, listens to responses, and asks follow-up questions. After the conversation ends, the system generates a structured assessment report scoring the candidate across five dimensions relevant to tutoring: communication clarity, warmth and empathy, simplification ability, patience and adaptability, and English fluency. Each score is backed by a direct quote from the transcript so hiring managers can verify the reasoning. The final recommendation — Advance, Hold, or Decline — is only ever set to Advance if the candidate completed all questions and scored above 7 out of 10.

---

### Key Decisions and Tradeoffs

**Groq over OpenAI or Gemini**
I initially attempted to use Google Gemini for the conversation and assessment. Every model version I tried returned 404 errors — the free tier API key did not have access to the models listed in the documentation. I switched fully to Groq, which uses the same Whisper model for transcription and LLaMA 3.3 70B for conversation and assessment. Groq's free tier is generous, the latency is very low, and both the STT and chat APIs worked on the first call. The tradeoff is vendor concentration — both transcription and AI run through a single provider — but for a prototype this was the right call.

**Browser `speechSynthesis` over server-side TTS**
I originally tried `edge-tts` (Microsoft's neural TTS) running on the backend. Render's cloud infrastructure blocked outbound requests to Microsoft's servers with 403 errors. Rather than fight infrastructure restrictions, I switched to the browser's built-in `speechSynthesis` API. It is free, requires zero server calls, works in every modern browser, and has no rate limits. The tradeoff is that voice quality and available voices vary by operating system and browser — on Chrome on Windows or Mac the quality is good enough for a screening tool.

**Silence detection via Web Audio AnalyserNode, not React state**
The hardest technical problem in the project was getting the microphone to automatically stop recording and send the answer after the candidate stops talking. Several approaches failed:
- React `useEffect` watching an `audioLevel` state variable — React batches state updates so the effect didn't fire on every audio frame
- Passing a callback into the recording hook — the callback captured stale closure values
- Storing the audio level in a ref synced from state — the ref was always one render behind

The solution that worked was exposing the raw `AnalyserNode` directly from the recording hook and reading it inside a `setInterval` that runs every 100ms completely outside React's render cycle. The interval reads fresh frequency data on every tick, compares it against a calibrated threshold of `0.095`, and fires the auto-send after 4 seconds of sustained silence. This approach has zero stale closure issues because it never touches React state in the detection path.

**Assessment score validation in `fix_report()`**
The LLaMA model would sometimes return `overall_score` as a string, invent scores inconsistent with the dimension scores, or recommend Advance on an empty transcript. I added a `fix_report()` function that runs after every AI response and recalculates `overall_score` from scratch using the weighted dimension scores, forces all labels to their correct values, and enforces the rule that Advance is only possible if the interview was fully completed. This means the recommendation is always mathematically correct regardless of what the model returns.

---

### What I Would Improve or Add With More Time

**Persistent storage**
Currently all sessions are held in memory on the Render server. If the server restarts, all sessions are lost. I would add a database — PostgreSQL or even a simple SQLite — to persist session data, transcripts, and reports so they can be reviewed later.

**Candidate dashboard for hiring managers**
Right now the report only exists in the browser tab during the session. I would build a password-protected dashboard where Cuemath hiring managers can see all completed interviews, filter by recommendation, and compare candidates side by side.

**Email report delivery**
After the interview ends, automatically email the report as a PDF to the hiring manager. This removes the need for them to be watching the session live.

**Adaptive questioning**
Aria currently follows a fixed question sequence. With more time I would make her ask follow-up questions based on what the candidate actually said — if a candidate mentions a specific teaching strategy, Aria should probe deeper rather than moving to the next scripted question.

**Better noise handling**
The current silence detection uses a fixed threshold of `0.095`. This works well in a quiet room but could misfire in a noisy environment. A better approach would be to measure the ambient noise level for the first second of recording and set the threshold dynamically relative to that baseline.

**Mobile support**
The current layout is optimised for desktop. The split-panel design with the orb on the left and transcript on the right does not work well on a phone screen. I would redesign the mobile layout to stack vertically and make the mic button larger for thumb use.

---

### Interesting Challenges and How I Solved Them

**The silence detection problem**
This was by far the most persistent challenge. The feature seemed simple — detect 4 seconds of quiet and auto-send — but it took multiple approaches before it worked reliably. The root cause was always the same: any approach that went through React's state system was unreliable because React batches and schedules updates asynchronously. The moment I bypassed React entirely — reading directly from the Web Audio `AnalyserNode` inside a raw `setInterval` — it worked on the first try. The lesson: for real-time audio processing, stay outside the React render cycle entirely.

**Gemini API 404 errors across all model versions**
Every Gemini model name I tried — `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash-8b`, `gemini-pro` — returned 404 on both `v1` and `v1beta` endpoints. The API key was valid and created in AI Studio. After considerable debugging I concluded the free tier key simply did not have access to those models in that Google Cloud project. Rather than continue debugging Google's access control system, I switched to Groq which worked immediately. The tradeoff of spending time debugging a broken integration versus switching providers is always a judgment call — in a prototype context, switching was clearly right.

**API keys appearing in Render logs**
Early in development I noticed that full error messages from the Groq and Gemini clients were being printed to Render's logs, and those messages sometimes included the API URL with the key embedded as a query parameter. I fixed this by changing all `print(f"error: {e}")` statements to `print(f"error: {type(e).__name__}")` which logs only the error class name — never the message content. I also regenerated any keys that had been exposed.
