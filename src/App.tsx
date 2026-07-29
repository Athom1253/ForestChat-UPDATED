import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { AnimatedBackground } from '@/components/ui/AnimatedBackground'
import AuthPage from '@/pages/AuthPage'
import AppLayout from '@/pages/AppLayout'
import ChatPage from '@/pages/ChatPage'
import FriendsPage from '@/pages/FriendsPage'
import RoomsPage from '@/pages/RoomsPage'
import ProfilePage from '@/pages/ProfilePage'
import SettingsPage from '@/pages/SettingsPage'
import AdminPage from '@/pages/AdminPage'
import PetsPage from '@/pages/PetsPage'
import DrawingPage from '@/pages/DrawingPage'

export default function App() {
  const { init, loading, session, settings } = useAuthStore()

  useEffect(() => {
    init()
  }, [init])

  // Apply theme
  useEffect(() => {
    const theme = settings?.theme || 'forest'
    document.documentElement.setAttribute('data-theme', theme)
    if (settings?.reduced_motion) {
      document.documentElement.classList.add('reduced-motion')
    } else {
      document.documentElement.classList.remove('reduced-motion')
    }
  }, [settings?.theme, settings?.reduced_motion])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-text-muted text-lg">ForestChat</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <AnimatedBackground />
      <Routes>
        <Route path="/auth" element={session ? <Navigate to="/" /> : <AuthPage />} />
        <Route element={session ? <AppLayout /> : <Navigate to="/auth" />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/pets" element={<PetsPage />} />
          <Route path="/drawing" element={<DrawingPage />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? "/" : "/auth"} />} />
      </Routes>
      <ToastContainer />
    </>
  )
}
