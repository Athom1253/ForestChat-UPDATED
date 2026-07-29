import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppUser, ChatWithDetails, Message } from './types'

export type AnimationTheme =
  | 'none'
  | 'forest-breeze'
  | 'paw-parade'
  | 'rainy-window'
  | 'starry-night'
  | 'cherry-blossom'
  | 'cloud-drift'
  | 'ocean-waves'
  | 'campfire-glow'
  | 'autumn-leaves'
  | 'winter-snow'
  | 'butterfly-garden'
  | 'aurora-dreams'

export type AnimationIntensity = 'low' | 'medium' | 'high'
export type AnimationSpeed = 'slow' | 'medium' | 'fast'

export interface AnimationPrefs {
  enabled: boolean
  theme: AnimationTheme
  intensity: AnimationIntensity
  speed: AnimationSpeed
  paused: boolean
  chatOverrides: Record<string, { theme: AnimationTheme; enabled: boolean }>
}

const DEFAULT_ANIM_PREFS: AnimationPrefs = {
  enabled: false,
  theme: 'none',
  intensity: 'medium',
  speed: 'medium',
  paused: false,
  chatOverrides: {},
}

interface AppState {
  currentUser: AppUser | null
  accounts: { id: string; username: string; display_name: string | null; avatar_url: string | null; created_at: string }[]
  setCurrentUser: (user: AppUser | null) => void
  addAccount: (user: AppUser) => void
  removeAccount: (id: string) => void

  chats: ChatWithDetails[]
  setChats: (chats: ChatWithDetails[]) => void
  activeChat: ChatWithDetails | null
  setActiveChat: (chat: ChatWithDetails | null) => void
  unreadTotals: Record<string, number>
  setUnreadTotals: (totals: Record<string, number>) => void

  messages: Record<string, Message[]>
  setMessages: (chatId: string, messages: Message[]) => void
  appendMessages: (chatId: string, messages: Message[]) => void
  prependMessages: (chatId: string, messages: Message[]) => void
  updateMessage: (chatId: string, messageId: string, partial: Partial<Message>) => void
  deleteMessage: (chatId: string, messageId: string) => void

  typingUsers: Record<string, string[]>
  setTypingUsers: (chatId: string, users: string[]) => void

  users: Record<string, AppUser>
  setUser: (user: AppUser) => void
  setUsers: (users: Record<string, AppUser>) => void

  // Global user presence
  onlineUsers: Set<string>
  setOnlineUser: (userId: string, online: boolean) => void

  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  palette: string
  setPalette: (palette: string) => void
  showSidebar: boolean
  setShowSidebar: (show: boolean) => void
  replyTo: Message | null
  setReplyTo: (message: Message | null) => void
  editMessage: Message | null
  setEditMessage: (message: Message | null) => void

  notifications: boolean
  setNotifications: (enabled: boolean) => void
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
  desktopNotifications: boolean
  setDesktopNotifications: (enabled: boolean) => void

  animationPrefs: AnimationPrefs
  setAnimationPrefs: (prefs: Partial<AnimationPrefs>) => void
  setChatAnimationOverride: (chatId: string, override: { theme: AnimationTheme; enabled: boolean } | null) => void

  fontPref: string
  setFontPref: (fontId: string) => void

  petEnabled: boolean
  setPetEnabled: (enabled: boolean) => void
  petName: string
  setPetName: (name: string) => void

  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[]
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void

  isImpersonating: boolean
  impersonatingOriginalId: string | null
  setImpersonation: (active: boolean, originalId: string | null) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      accounts: [],
      setCurrentUser: (user) => set({ currentUser: user }),
      addAccount: (user) => {
        const accounts = get().accounts.filter((a) => a.id !== user.id)
        accounts.push({
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          created_at: user.created_at || new Date().toISOString(),
        })
        set({ accounts, currentUser: user })
      },
      removeAccount: (id) => {
        const accounts = get().accounts.filter((a) => a.id !== id)
        const current = get().currentUser
        set({
          accounts,
          currentUser: current?.id === id ? null : current,
        })
      },

      chats: [],
      setChats: (chats) => set({ chats }),
      activeChat: null,
      setActiveChat: (chat) => set({ activeChat: chat, replyTo: null, editMessage: null }),
      unreadTotals: {},
      setUnreadTotals: (totals) => set({ unreadTotals: totals }),

      messages: {},
      setMessages: (chatId, messages) =>
        set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),
      appendMessages: (chatId, messages) =>
        set((state) => {
          const existing = state.messages[chatId] || []
          const existingIds = new Set(existing.map((m) => m.id))
          const newMessages = messages.filter((m) => !existingIds.has(m.id))
          return { messages: { ...state.messages, [chatId]: [...existing, ...newMessages] } }
        }),
      prependMessages: (chatId, messages) =>
        set((state) => {
          const existing = state.messages[chatId] || []
          const existingIds = new Set(existing.map((m) => m.id))
          const newMessages = messages.filter((m) => !existingIds.has(m.id))
          return { messages: { ...state.messages, [chatId]: [...newMessages, ...existing] } }
        }),
      updateMessage: (chatId, messageId, partial) =>
        set((state) => {
          const existing = state.messages[chatId] || []
          const updated = existing.map((m) => (m.id === messageId ? { ...m, ...partial } : m))
          return { messages: { ...state.messages, [chatId]: updated } }
        }),
      deleteMessage: (chatId, messageId) =>
        set((state) => {
          const existing = state.messages[chatId] || []
          return { messages: { ...state.messages, [chatId]: existing.filter((m) => m.id !== messageId) } }
        }),

      typingUsers: {},
      setTypingUsers: (chatId, users) =>
        set((state) => ({ typingUsers: { ...state.typingUsers, [chatId]: users } })),

      users: {},
      setUser: (user) => set((state) => ({ users: { ...state.users, [user.id]: user } })),
      setUsers: (users) => set({ users }),

      onlineUsers: new Set(),
      setOnlineUser: (userId, online) =>
        set((state) => {
          const next = new Set(state.onlineUsers)
          if (online) next.add(userId)
          else next.delete(userId)
          return { onlineUsers: next }
        }),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      palette: 'none',
      setPalette: (palette) => set({ palette }),
      showSidebar: true,
      setShowSidebar: (show) => set({ showSidebar: show }),
      replyTo: null,
      setReplyTo: (message) => set({ replyTo: message }),
      editMessage: null,
      setEditMessage: (message) => set({ editMessage: message }),

      notifications: true,
      setNotifications: (enabled) => set({ notifications: enabled }),
      soundEnabled: true,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      desktopNotifications: false,
      setDesktopNotifications: (enabled) => set({ desktopNotifications: enabled }),

      animationPrefs: DEFAULT_ANIM_PREFS,
      setAnimationPrefs: (prefs) =>
        set((state) => ({ animationPrefs: { ...state.animationPrefs, ...prefs } })),
      setChatAnimationOverride: (chatId, override) =>
        set((state) => {
          const overrides = { ...state.animationPrefs.chatOverrides }
          if (override === null) delete overrides[chatId]
          else overrides[chatId] = override
          return { animationPrefs: { ...state.animationPrefs, chatOverrides: overrides } }
        }),

      fontPref: 'comic-sans',
      setFontPref: (fontId) => set({ fontPref: fontId }),

      petEnabled: false,
      setPetEnabled: (enabled) => set({ petEnabled: enabled }),
      petName: 'Fern',
      setPetName: (name) => set({ petName: name }),

      toasts: [],
      addToast: (message, type = 'info') => {
        const id = Math.random().toString(36).slice(2)
        set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
        setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 4000)
      },
      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      isImpersonating: false,
      impersonatingOriginalId: null,
      setImpersonation: (active, originalId) => set({ isImpersonating: active, impersonatingOriginalId: originalId }),
    }),
    {
      name: 'chat-app-storage',
      partialize: (state) => ({
        accounts: state.accounts,
        theme: state.theme,
        palette: state.palette,
        notifications: state.notifications,
        soundEnabled: state.soundEnabled,
        desktopNotifications: state.desktopNotifications,
        animationPrefs: state.animationPrefs,
        fontPref: state.fontPref,
        petEnabled: state.petEnabled,
        petName: state.petName,
      }),
    }
  )
)
