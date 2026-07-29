import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import ProfilePictureUpload from '../components/ProfilePictureUpload'

export default function EditProfilePage() {
  const { profile, user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setBio(profile.bio ?? '')
      setPronouns(profile.pronouns ?? '')
      setBannerUrl(profile.banner_url ?? '')
      setAvatarUrl(profile.avatar_url)
    }
  }, [profile])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('app_users')
      .update({
        display_name: displayName || null,
        bio,
        pronouns: pronouns || null,
        banner_url: bannerUrl || null,
        avatar_url: avatarUrl,
      })
      .eq('id', user.id)
    if (error) {
      toast(error.message, 'error')
      setSaving(false)
      return
    }
    await refreshProfile()
    toast('Profile updated', 'success')
    setSaving(false)
    navigate(-1)
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-night-950 via-forest-950 to-night-900">
        <svg className="h-8 w-8 animate-spin text-forest-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-night-950 via-forest-950 to-night-900 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-forest-50 tracking-tight">Edit Profile</h1>
            <p className="mt-1 text-sm text-night-300">Update your forest identity</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-night-700 bg-night-800/50 px-4 py-2 text-sm font-medium text-night-200 transition-colors hover:bg-night-700"
          >
            Back
          </button>
        </div>

        <section className="animate-fade-in rounded-2xl border border-night-700/50 bg-night-800/70 p-6 shadow-lg backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-forest-100">Profile Picture</h2>
          <p className="mt-0.5 text-xs text-night-400">Drag &amp; drop or click to upload</p>
          <div className="mt-4 flex justify-center">
            <ProfilePictureUpload currentUrl={avatarUrl} onUpload={setAvatarUrl} />
          </div>
        </section>

        <section className="animate-fade-in rounded-2xl border border-night-700/50 bg-night-800/70 p-6 shadow-lg backdrop-blur-xl space-y-4">
          <h2 className="text-sm font-semibold text-forest-100">Details</h2>

          <div>
            <label className="block text-sm font-medium text-night-300 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              className="w-full rounded-xl border border-night-700 bg-night-900/70 px-3 py-2.5 text-forest-50 placeholder-night-500 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-night-300 mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell something about yourself"
              rows={3}
              className="w-full resize-none rounded-xl border border-night-700 bg-night-900/70 px-3 py-2.5 text-forest-50 placeholder-night-500 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-night-300 mb-1">Pronouns</label>
            <input
              type="text"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              placeholder="e.g. they/them"
              className="w-full rounded-xl border border-night-700 bg-night-900/70 px-3 py-2.5 text-forest-50 placeholder-night-500 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-night-300 mb-1">Banner URL</label>
            <input
              type="text"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-night-700 bg-night-900/70 px-3 py-2.5 text-forest-50 placeholder-night-500 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-night-700 bg-night-800/50 px-5 py-2.5 text-sm font-semibold text-night-200 transition-colors hover:bg-night-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : null}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
