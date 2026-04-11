import React, { useState } from 'react'
import WelcomeScreen from './components/WelcomeScreen'
import InterviewScreen from './components/InterviewScreen'
import ReportScreen from './components/ReportScreen'

export default function App() {
  const [screen, setScreen] = useState('welcome') // 'welcome' | 'interview' | 'report'
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

  if (screen === 'welcome') return <WelcomeScreen onStart={handleStart} />
  if (screen === 'interview') return <InterviewScreen session={session} onComplete={handleComplete} />
  if (screen === 'report') return <ReportScreen sessionId={completedSessionId} />
  return null
}