import React, { useState } from 'react'
import ErrorBoundary from './ErrorBoundary'
import WelcomeScreen from './components/WelcomeScreen'
import InterviewScreen from './components/InterviewScreen'
import ReportScreen from './components/ReportScreen'

export default function App() {
  const [screen, setScreen] = useState('welcome')
  const [session, setSession] = useState(null)
  const [completedSessionId, setCompletedSessionId] = useState(null)

  const handleStart = (sessionData) => {
    setSession(sessionData)
    setScreen('interview')
  }

  const handleComplete = (sessionId) => {
    setCompletedSessionId(sessionId)
    setScreen('report')
  }

  return (
    <ErrorBoundary>
      {screen === 'welcome' && <WelcomeScreen onStart={handleStart} />}
      {screen === 'interview' && session && (
        <ErrorBoundary>
          <InterviewScreen session={session} onComplete={handleComplete} />
        </ErrorBoundary>
      )}
      {screen === 'report' && <ReportScreen sessionId={completedSessionId} />}
    </ErrorBoundary>
  )
}
