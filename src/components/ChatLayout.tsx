import { useState, useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getInitials, getAvatarUrl } from '../lib/utils'
import Sidebar from './Sidebar'
import PetCompanion from './PetCompanion'
import { useToast } from '../lib/toast'

interface ChatLayoutProps {
  children: ReactNode
}

interface NavItemDef {
  to: string
  label: string
  icon: ReactNode
  adminOnly?: boolean
}

const NAV_ITEMS: NavItemDef[] = [
  { to: '/', label: 'Chats', icon: <ChatIcon /> },
  { to: '/rooms', label: 'Rooms', icon: <RoomsIcon /> },
  { to: '/friends', label: 'Friends', icon: <FriendsIcon /> },
  { to: '/pets', label: 'Pets', icon: <PetsIcon /> },
  { to: '/drawing', label: 'Drawing', icon: <DrawingIcon /> },
  { to: '/admin', label: 'Admin', icon: <AdminIcon />, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
]

export default function ChatLayout({ children }: ChatLayoutProps) {
  const navigate = useNavigate()
  const { profile, signOut, savedAccounts } = useAuth()
  const { toast } = useToast()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  const accountMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!accountMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [accountMenuOpen])

  const handleSignOut = async () => {
    await signOut()
    setAccountMenuOpen(false)
    toast('Signed out successfully', 'info')
    navigate('/auth')
  }

  const handleSwitchAccount = () => {
    setAccountMenuOpen(false)
    handleSignOut()
  }

  const handleMyProfile = () => {
    if (!profile) return
    setAccountMenuOpen(false)
    navigate(`/profile/${profile.id}`)
  }

  const handleSettings = () => {
    setAccountMenuOpen(false)
    navigate('/settings')
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || profile?.is_admin)

  const avatarUrl = profile ? getAvatarUrl(profile.avatar_url) : null
  const displayName = profile?.display_name || profile?.username || 'User'

  return (
    <div className="flex h-screen w-full overflow-hidden bg-night-950 text-night-100">
      <nav className="hidden md:flex flex-col items-center gap-1 w-16 py-4 bg-night-900 border-r border-night-800 flex-shrink-0">
        <div className="mb-4 flex items-center justify-center w-10 h-10 rounded-xl bg-forest-700 text-night-50">
          <LogoIcon />
        </div>

        <div className="flex-1 flex flex-col items-center gap-1 w-full">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-forest-700 text-night-50'
                    : 'text-night-400 hover:bg-night-800 hover:text-night-100'
                }`
              }
            >
              {item.icon}
              <span className="pointer-events-none absolute left-14 z-50 px-2.5 py-1.5 rounded-lg bg-night-800 text-night-50 text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border border-night-700">
                {item.label}
              </span>
            </NavLink>
          ))}
        </div>

        <div className="relative mt-2" ref={accountMenuOpen ? accountMenuRef : undefined}>
          <button
            onClick={() => setAccountMenuOpen((v) => !v)}
            className="flex items-center justify-center w-11 h-11 rounded-full overflow-hidden ring-2 ring-night-700 hover:ring-forest-600 transition-all"
            aria-label="Account menu"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-forest-700 text-night-50 text-sm font-semibold">
                {getInitials(displayName)}
              </div>
            )}
          </button>

          {accountMenuOpen && (
            <AccountMenu
              avatarUrl={avatarUrl}
              displayName={displayName}
              username={profile?.username || ''}
              savedAccounts={savedAccounts}
              onMyProfile={handleMyProfile}
              onSettings={handleSettings}
              onSwitchAccount={handleSwitchAccount}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      </nav>

      {sidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed sm:static inset-y-0 left-0 z-50 sm:z-auto transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
        }`}
      >
        <Sidebar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sm:hidden flex items-center gap-3 px-4 py-3 bg-night-900 border-b border-night-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-night-300 hover:bg-night-800 hover:text-night-50 transition-colors"
            aria-label="Open menu"
          >
            <HamburgerIcon />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-forest-700 text-night-50">
              <LogoIcon />
            </div>
            <h1 className="text-lg font-semibold text-night-50">ForestChat</h1>
          </div>
        </header>

        <main className="flex-1 overflow-hidden min-w-0">{children}</main>
      </div>
      <PetCompanion />
    </div>
  )
}

interface AccountMenuProps {
  avatarUrl: string | null
  displayName: string
  username: string
  savedAccounts: { email: string; username: string; avatar_url: string | null; display_name: string | null }[]
  onMyProfile: () => void
  onSettings: () => void
  onSwitchAccount: () => void
  onSignOut: () => void
}

function AccountMenu({
  avatarUrl,
  displayName,
  username,
  savedAccounts,
  onMyProfile,
  onSettings,
  onSwitchAccount,
  onSignOut,
}: AccountMenuProps) {
  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-64 rounded-2xl bg-night-800 border border-night-700 shadow-2xl overflow-hidden animate-fade-in">
      <div className="flex items-center gap-3 p-4 border-b border-night-700">
        <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-forest-700 text-night-50 text-sm font-semibold">
              {getInitials(displayName)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-night-50">{displayName}</p>
          <p className="truncate text-xs text-night-400">@{username}</p>
        </div>
      </div>

      <div className="p-1.5">
        <MenuButton onClick={onMyProfile} icon={<UserIcon />} label="My Profile" />
        <MenuButton onClick={onSettings} icon={<SettingsIcon />} label="Settings" />

        {savedAccounts.length > 1 && (
          <div className="my-1.5 py-1.5 border-t border-b border-night-700">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-night-500">
              Switch Account
            </p>
            <div className="max-h-40 overflow-y-auto scrollbar-thin">
              {savedAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={onSwitchAccount}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-night-700 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                    {acc.avatar_url ? (
                      <img src={acc.avatar_url} alt={acc.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-forest-700 text-night-50 text-[10px] font-semibold">
                        {getInitials(acc.display_name || acc.username)}
                      </div>
                    )}
                  </div>
                  <span className="truncate text-sm text-night-200">@{acc.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <MenuButton onClick={onSignOut} icon={<LogoutIcon />} label="Log Out" danger />
      </div>
    </div>
  )
}

interface MenuButtonProps {
  onClick: () => void
  icon: ReactNode
  label: string
  danger?: boolean
}

function MenuButton({ onClick, icon, label, danger }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-night-200 hover:bg-night-700 hover:text-night-50'
      }`}
    >
      <span className={danger ? 'text-red-400' : 'text-night-400'}>{icon}</span>
      {label}
    </button>
  )
}

function LogoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L8 8h3v6l-5 7h12l-5-7V8h3z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RoomsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  )
}

function FriendsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function PetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="7.5" r="1.8" />
      <circle cx="18.5" cy="7.5" r="1.8" />
      <circle cx="9" cy="4.5" r="1.8" />
      <circle cx="15" cy="4.5" r="1.8" />
      <path d="M12 11c-3.5 0-6 3-6 6 0 2.5 2 3.5 4 3.5h4c2 0 4-1 4-3.5 0-3-2.5-6-6-6z" />
    </svg>
  )
}

function DrawingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
