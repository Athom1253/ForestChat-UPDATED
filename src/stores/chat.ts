import { create } from 'zustand'
import type { Channel, ChannelMember, Profile } from '@/types'

interface ChatState {
  channels: (Channel & { last_message?: string; last_message_at?: string })[]
  members: ChannelMember[]
  activeChannelId: string | null
  profiles: Record<string, Profile>
  loadingChannels: boolean
  setActiveChannel: (channelId: string | null) => void
  setChannels: (channels: ChatState['channels']) => void
  setMembers: (members: ChannelMember[]) => void
  updateMember: (member: ChannelMember) => void
  addChannel: (channel: Channel) => void
  removeChannel: (channelId: string) => void
  setProfile: (profile: Profile) => void
  setProfiles: (profiles: Profile[]) => void
  setLoadingChannels: (loading: boolean) => void
  updateChannelLastMessage: (channelId: string, content: string, at: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  members: [],
  activeChannelId: null,
  profiles: {},
  loadingChannels: true,

  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  setChannels: (channels) => set({ channels }),
  setMembers: (members) => set({ members }),
  updateMember: (member) =>
    set((state) => {
      const idx = state.members.findIndex((m) => m.id === member.id)
      if (idx >= 0) {
        const newMembers = [...state.members]
        newMembers[idx] = member
        return { members: newMembers }
      }
      return { members: [...state.members, member] }
    }),
  addChannel: (channel) =>
    set((state) => ({ channels: [...state.channels, channel] })),
  removeChannel: (channelId) =>
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== channelId),
      activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
    })),
  setProfile: (profile) =>
    set((state) => ({ profiles: { ...state.profiles, [profile.id]: profile } })),
  setProfiles: (profiles) =>
    set((state) => {
      const map = { ...state.profiles }
      profiles.forEach((p) => { map[p.id] = p })
      return { profiles: map }
    }),
  setLoadingChannels: (loading) => set({ loadingChannels: loading }),
  updateChannelLastMessage: (channelId, content, at) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, last_message: content, last_message_at: at } : c
      ),
    })),
}))
