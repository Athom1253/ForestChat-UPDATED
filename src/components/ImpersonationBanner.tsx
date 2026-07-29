import { useNavigate } from 'react-router-dom'
import { TriangleAlert as AlertTriangle, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { stopImpersonation } from '../lib/adminApi'

export default function ImpersonationBanner() {
  const navigate = useNavigate()
  const currentUser = useStore((s) => s.currentUser)

  const handleStop = () => {
    stopImpersonation()
    navigate('/admin')
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-black px-4 py-2 flex items-center justify-center gap-3 text-sm font-semibold shadow-lg">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        IMPERSONATION MODE — You are viewing the app as <strong>{currentUser?.username}</strong>.
        All actions are logged.
      </span>
      <button
        onClick={handleStop}
        className="ml-2 flex items-center gap-1 px-3 py-0.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
      >
        <X className="w-3.5 h-3.5" /> Exit
      </button>
    </div>
  )
}
