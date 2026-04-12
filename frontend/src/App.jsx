import React, { useState } from 'react'
import ErrorBoundary from './ErrorBoundary.jsx'
import WelcomeScreen from './components/WelcomeScreen.jsx'
import InterviewScreen from './components/InterviewScreen.jsx'
import ReportScreen from './components/ReportScreen.jsx'

export default function App() {
  const [screen, setScreen]                   = useState('welcome')
  const [session, setSession]                 = useState(null)
  const [completedSessionId, setCompletedId]  = useState(null)
  const [finalTranscript, setFinalTranscript] = useState([])

  const handleStart = (sessionData) => {
    setSession(sessionData)
    setScreen('interview')
  }

  const handleComplete = (sessionId, transcript) => {
    setCompletedId(sessionId)
    setFinalTranscript(Array.isArray(transcript) ? transcript : [])
    setScreen('report')
  }

  return (
    <ErrorBoundary>
      {screen === 'welcome' && (
        <WelcomeScreen onStart={handleStart} />
      )}
      {screen === 'interview' && session && (
        <ErrorBoundary>
          <InterviewScreen session={session} onComplete={handleComplete} />
        </ErrorBoundary>
      )}
      {screen === 'report' && (
        <ReportScreen sessionId={completedSessionId} transcript={finalTranscript} />
      )}
    </ErrorBoundary>
  )
}
