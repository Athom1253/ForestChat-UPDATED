import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { lastSeenLabel, formatFileSize } from '@/lib/utils'
import type { Profile, Pet } from '@/types'

export default function ProfilePage() {
  const { userId } = useParams()
  const { user, profile: myProfile, updateProfile } = useAuthStore()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [pet, setPet] = useState<Pet | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ display_name: '', bio: '', status_message: '' })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

  const isOwn = !userId || userId === user?.id

  useEffect(() => {
    loadProfile()
  }, [userId, user?.id])

  async function loadProfile() {
    setLoading(true)
    const targetId = userId || user?.id
    if (!targetId) { setLoading(false); return }

    const { data } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle()
    setProfile(data)
    if (data) {
      setEditData({ display_name: data.display_name || '', bio: data.bio || '', status_message: data.status_message || '' })
    }

    const { data: petData } = await supabase.from('pets').select('*').eq('owner_id', targetId).maybeSingle()
    setPet(petData)
    setLoading(false)
  }

  const saveProfile = async () => {
    const { error } = await updateProfile({
      display_name: editData.display_name,
      bio: editData.bio,
      status_message: editData.status_message,
    })
    if (error) toast.error('Failed to save profile')
    else { toast.success('Profile updated!'); setEditing(false); loadProfile() }
  }

  const uploadAvatar = async (file: File) => {
    if (!user) return
    setUploadingAvatar(true)

    // Compress image
    const compressed = await compressImage(file, 256, 256)
    const fileName = `${user.id}/avatar-${Date.now()}.webp`

    try {
      const { data, error } = await supabase.storage.from('avatars').upload(fileName, compressed, { contentType: 'image/webp' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(data.path)
      await updateProfile({ avatar_url: publicUrl })
      toast.success('Avatar updated!')
      loadProfile()
    } catch (err) {
      toast.error('Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const uploadBanner = async (file: File) => {
    if (!user) return
    setUploadingBanner(true)
    const compressed = await compressImage(file, 1200, 400)
    const fileName = `${user.id}/banner-${Date.now()}.webp`

    try {
      const { data, error } = await supabase.storage.from('avatars').upload(fileName, compressed, { contentType: 'image/webp' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(data.path)
      await updateProfile({ banner_url: publicUrl })
      toast.success('Banner updated!')
      loadProfile()
    } catch (err) {
      toast.error('Failed to upload banner')
    } finally {
      setUploadingBanner(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 bg-bg overflow-y-auto">
        <div className="skeleton h-48" />
        <div className="max-w-2xl mx-auto p-6">
          <div className="skeleton h-24 w-24 rounded-full -mt-12" />
          <div className="skeleton h-6 w-48 mt-4" />
          <div className="skeleton h-4 w-32 mt-2" />
          <div className="skeleton h-20 w-full mt-6" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg">
        <p className="text-text-muted">Profile not found</p>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-bg overflow-y-auto">
      {/* Banner */}
      <div className="relative h-48 bg-surface group">
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/20" />
        )}
        {isOwn && (
          <label className="absolute bottom-3 right-3 cursor-pointer">
            <div className="px-3 py-1.5 bg-bg/80 backdrop-blur rounded-lg text-sm text-text hover:bg-bg flex items-center gap-2">
              {uploadingBanner ? 'Uploading...' : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.9l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.9l.812 1.2A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Change Banner
                </>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
          </label>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-6">
        {/* Avatar */}
        <div className="relative -mt-12 mb-4">
          <div className="w-24 h-24 rounded-full border-4 border-bg overflow-hidden bg-surface">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary text-3xl font-bold">{profile.username[0]?.toUpperCase()}</div>
            )}
          </div>
          {isOwn && (
            <label className="absolute bottom-0 left-20 cursor-pointer">
              <div className="w-8 h-8 bg-surface border border-border rounded-full flex items-center justify-center hover:bg-surface-hover">
                {uploadingAvatar ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.9l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.9l.812 1.2A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </label>
          )}
        </div>

        {/* Profile info */}
        {editing ? (
          <div className="space-y-3 mb-6">
            <input
              value={editData.display_name}
              onChange={(e) => setEditData({ ...editData, display_name: e.target.value })}
              className="input"
              placeholder="Display Name"
            />
            <input
              value={editData.status_message}
              onChange={(e) => setEditData({ ...editData, status_message: e.target.value })}
              className="input"
              placeholder="Status message"
            />
            <textarea
              value={editData.bio}
              onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
              className="input"
              rows={3}
              placeholder="Bio"
            />
            <div className="flex gap-2">
              <button onClick={saveProfile} className="btn-primary">Save</button>
              <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-text">{profile.display_name || profile.username}</h1>
              {isOwn && (
                <button onClick={() => setEditing(true)} className="btn-ghost text-sm">Edit</button>
              )}
            </div>
            <p className="text-text-muted">@{profile.username}</p>
            {profile.status_message && <p className="text-sm text-primary mt-2">{profile.status_message}</p>}
            {profile.bio && <p className="text-text mt-3">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-4 text-sm text-text-muted">
              <span>Joined {new Date(profile.join_date).toLocaleDateString()}</span>
              <span className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${profile.status === 'online' ? 'bg-success' : profile.status === 'away' ? 'bg-warning' : 'bg-text-muted/40'}`} />
                {profile.status === 'online' ? 'Online' : lastSeenLabel(profile.last_seen)}
              </span>
              {profile.is_admin && <span className="text-accent font-medium">Admin</span>}
            </div>
          </div>
        )}

        {/* Virtual pet info */}
        {pet && (
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-text mb-3">Virtual Pet</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center text-3xl">
                {pet.species === 'forest_sprite' ? '🌿' : pet.species === 'leaf_fox' ? '🦊' : pet.species === 'moss_bear' ? '🐻' : '🐾'}
              </div>
              <div className="flex-1">
                <p className="font-medium text-text">{pet.name}</p>
                <p className="text-sm text-text-muted capitalize">{pet.species.replace('_', ' ')} · Level {pet.level}</p>
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-success">Energy: {pet.energy}</span>
                  <span className="text-primary">Happy: {pet.happiness}</span>
                  <span className="text-warning">Hunger: {pet.hunger}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

async function compressImage(file: File, maxWidth: number, maxHeight: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
      if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
