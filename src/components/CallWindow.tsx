import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorOff,
  Users, Volume2, VolumeX, Maximize2, Minimize2, PictureInPicture2,
  Minus, ChevronDown, Phone,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../lib/types'

interface CallWindowProps {
  chatId: string
  chatName: string
  currentUser: AppUser
  members: AppUser[]
  mode: 'voice' | 'video'
  onClose: () => void
}

interface RemoteParticipant {
  userId: string
  user: AppUser | null
  stream: MediaStream | null
  muted: boolean
  videoOff: boolean
  audioLevel: number
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

export default function CallWindow({ chatId, chatName, currentUser, members, mode, onClose }: CallWindowProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map())
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(mode === 'voice')
  const [sharing, setSharing] = useState(false)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting')
  const [duration, setDuration] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showVolume, setShowVolume] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [joinLeaveLog, setJoinLeaveLog] = useState<{ name: string; action: 'joined' | 'left'; ts: number }[]>([])
  const [showParticipants, setShowParticipants] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingCandidates = useRef<Map<string, RTCIceCandidate[]>>(new Map())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioLevelTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Media acquisition ──────────────────────────────────────────────────────

  const acquireMedia = useCallback(async (withVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setStatus('connected')
      return stream
    } catch (err) {
      console.error('Media acquisition failed:', err)
      setStatus('failed')
      return null
    }
  }, [])

  useEffect(() => {
    acquireMedia(mode === 'video')
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      durationRef.current && clearInterval(durationRef.current)
      audioLevelTimers.current.forEach((t) => clearInterval(t))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build peer connection ──────────────────────────────────────────────────

  const makePC = useCallback((remoteUserId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice',
          payload: { from: currentUser.id, to: remoteUserId, candidate: e.candidate.toJSON() },
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state with ${remoteUserId}:`, pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setStatus('connected')
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteUserId}:`, pc.connectionState)
      if (pc.connectionState === 'connected') setStatus('connected')
      if (pc.connectionState === 'failed') {
        // Attempt ICE restart
        pc.restartIce()
      }
    }

    // This is the critical fix: attach remote tracks to a stream for audio playback
    pc.ontrack = (e) => {
      console.log('Remote track received:', e.track.kind, 'from', remoteUserId)
      const stream = e.streams[0] || new MediaStream([e.track])
      setParticipants((prev) => {
        const next = new Map(prev)
        const p = next.get(remoteUserId)
        if (p) {
          next.set(remoteUserId, { ...p, stream })
        } else {
          next.set(remoteUserId, {
            userId: remoteUserId,
            user: null,
            stream,
            muted: false,
            videoOff: false,
            audioLevel: 0,
          })
        }
        return next
      })
    }

    return pc
  }, [currentUser.id])

  const addTracksToPC = useCallback((pc: RTCPeerConnection) => {
    const stream = localStreamRef.current
    if (!stream) return
    const existing = pc.getSenders().map((s) => s.track?.id)
    stream.getTracks().forEach((track) => {
      if (!existing.includes(track.id)) {
        pc.addTrack(track, stream)
      }
    })
  }, [])

  // ── Signalling ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel(`call:${chatId}`, {
      config: { broadcast: { self: false } },
    })

    const waitForStream = (): Promise<MediaStream> =>
      new Promise((resolve) => {
        if (localStreamRef.current) { resolve(localStreamRef.current); return }
        const check = setInterval(() => {
          if (localStreamRef.current) { clearInterval(check); resolve(localStreamRef.current) }
        }, 100)
      })

    ch
      .on('broadcast', { event: 'join' }, async ({ payload }: any) => {
        const { userId, user: remoteUser } = payload
        if (userId === currentUser.id) return

        console.log('Remote user joined:', userId)
        setParticipants((prev) => {
          const next = new Map(prev)
          if (!next.has(userId)) {
            next.set(userId, { userId, user: remoteUser, stream: null, muted: false, videoOff: false, audioLevel: 0 })
          }
          return next
        })
        setJoinLeaveLog((l) => [...l, { name: remoteUser?.display_name || remoteUser?.username || userId, action: 'joined', ts: Date.now() }])

        // Wait for local stream, then send offer
        const stream = await waitForStream()
        const pc = makePC(userId)
        peerConnections.current.set(userId, pc)
        stream.getTracks().forEach((t) => pc.addTrack(t, stream))
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        ch.send({
          type: 'broadcast',
          event: 'offer',
          payload: { from: currentUser.id, to: userId, sdp: pc.localDescription },
        })
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
        const { from, to, sdp } = payload
        if (to !== currentUser.id) return
        console.log('Received offer from:', from)

        const stream = await waitForStream()
        let pc = peerConnections.current.get(from)
        if (!pc) {
          pc = makePC(from)
          peerConnections.current.set(from, pc)
        }
        stream.getTracks().forEach((t) => {
          const senders = pc!.getSenders()
          if (!senders.find((s) => s.track?.id === t.id)) pc!.addTrack(t, stream)
        })
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        const pending = pendingCandidates.current.get(from) || []
        for (const c of pending) { try { await pc.addIceCandidate(c) } catch {} }
        pendingCandidates.current.delete(from)
        ch.send({
          type: 'broadcast',
          event: 'answer',
          payload: { from: currentUser.id, to: from, sdp: pc.localDescription },
        })
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
        const { from, to, sdp } = payload
        if (to !== currentUser.id) return
        console.log('Received answer from:', from)
        const pc = peerConnections.current.get(from)
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp))
          const pending = pendingCandidates.current.get(from) || []
          for (const c of pending) { try { await pc.addIceCandidate(c) } catch {} }
          pendingCandidates.current.delete(from)
        }
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }: any) => {
        const { from, to, candidate } = payload
        if (to !== currentUser.id) return
        const pc = peerConnections.current.get(from)
        if (!pc) return
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } else {
            const pending = pendingCandidates.current.get(from) || []
            pending.push(new RTCIceCandidate(candidate))
            pendingCandidates.current.set(from, pending)
          }
        } catch (e) {
          console.warn('Failed to add ICE candidate:', e)
        }
      })
      .on('broadcast', { event: 'leave' }, ({ payload }: any) => {
        const { userId, userName } = payload
        setParticipants((prev) => {
          const next = new Map(prev)
          const p = next.get(userId)
          if (p) setJoinLeaveLog((l) => [...l, { name: p.user?.display_name || p.user?.username || userId, action: 'left', ts: Date.now() }])
          next.delete(userId)
          return next
        })
        if (userName) setJoinLeaveLog((l) => [...l, { name: userName, action: 'left', ts: Date.now() }])
        peerConnections.current.get(userId)?.close()
        peerConnections.current.delete(userId)
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          channelRef.current = ch
          ch.send({
            type: 'broadcast',
            event: 'join',
            payload: { userId: currentUser.id, user: currentUser },
          })
        }
      })

    return () => {
      ch.send({
        type: 'broadcast',
        event: 'leave',
        payload: { userId: currentUser.id, userName: currentUser.display_name || currentUser.username },
      })
      ch.unsubscribe()
      peerConnections.current.forEach((pc) => pc.close())
      peerConnections.current.clear()
    }
  }, [chatId, currentUser.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Duration timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (status === 'connected') {
      durationRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    }
    return () => { durationRef.current && clearInterval(durationRef.current) }
  }, [status])

  // Clear old join/leave log entries
  useEffect(() => {
    const t = setInterval(() => {
      setJoinLeaveLog((l) => l.filter((e) => Date.now() - e.ts < 4000))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleMute = () => {
    const stream = localStreamRef.current
    if (!stream) return
    const newMuted = !muted
    stream.getAudioTracks().forEach((t) => { t.enabled = !newMuted })
    setMuted(newMuted)
  }

  const toggleVideo = async () => {
    const stream = localStreamRef.current
    if (!stream) return
    const newVideoOff = !videoOff

    if (newVideoOff) {
      // Turn camera off — stop and remove video tracks
      stream.getVideoTracks().forEach((t) => {
        t.stop()
        stream.removeTrack(t)
      })
      // Remove from all peer connections
      peerConnections.current.forEach((pc) => {
        pc.getSenders().filter((s) => s.track?.kind === 'video').forEach((s) => {
          pc.removeTrack(s)
        })
      })
      setVideoOff(true)
    } else {
      // Turn camera back on — acquire a new video track
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const [newTrack] = videoStream.getVideoTracks()
        stream.addTrack(newTrack)
        // Replace or add in all peer connections
        peerConnections.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(newTrack)
          } else {
            pc.addTrack(newTrack, stream)
          }
        })
        // Update local preview
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        setVideoOff(false)
      } catch (err) {
        console.error('Failed to re-acquire camera:', err)
      }
    }
  }

  const toggleShare = async () => {
    if (sharing) {
      // Stop sharing — restore camera
      const stream = localStreamRef.current
      if (!stream) return
      const videoTracks = stream.getVideoTracks()
      videoTracks.forEach((t) => { t.stop(); stream.removeTrack(t) })
      if (!videoOff) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
          const [camTrack] = camStream.getVideoTracks()
          stream.addTrack(camTrack)
          peerConnections.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
            if (sender) sender.replaceTrack(camTrack)
          })
          if (localVideoRef.current) localVideoRef.current.srcObject = stream
        } catch { /* user may have revoked permission */ }
      }
      setSharing(false)
      return
    }

    try {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true })
      const [screenTrack] = screenStream.getVideoTracks()
      const screenAudioTracks = screenStream.getAudioTracks()
      const stream = localStreamRef.current!
      // Replace existing video senders
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenTrack)
        else pc.addTrack(screenTrack, stream)
        // Add screen audio if available
        if (screenAudioTracks.length > 0) {
          const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio')
          if (audioSender && !muted) audioSender.replaceTrack(screenAudioTracks[0])
        }
      })
      if (localVideoRef.current) {
        const previewStream = new MediaStream([screenTrack])
        localVideoRef.current.srcObject = previewStream
      }
      screenTrack.onended = () => { toggleShare() }
      setSharing(true)
      setVideoOff(false)
    } catch { /* user cancelled */ }
  }

  const hangUp = () => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'leave',
      payload: { userId: currentUser.id, userName: currentUser.display_name || currentUser.username },
    })
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    peerConnections.current.forEach((pc) => pc.close())
    onClose()
  }

  const toggleFullscreen = () => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setFullscreen(false)
    }
  }

  const applyVolume = (v: number) => {
    setVolume(v)
    // Apply to all remote audio elements
    document.querySelectorAll<HTMLAudioElement>('[data-remote-audio]').forEach((el) => {
      el.volume = v
    })
  }

  const allParticipants = [
    { userId: currentUser.id, user: currentUser, stream: localStream, muted, videoOff: videoOff || sharing, isLocal: true, audioLevel: 0 },
    ...Array.from(participants.values()).map((p) => ({ ...p, isLocal: false })),
  ]

  const gridCols = allParticipants.length === 1 ? 'grid-cols-1' :
    allParticipants.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'

  if (minimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed top-20 right-4 z-40 bg-bg-surface border border-border rounded-3xl shadow-2xl p-3 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
          {mode === 'video' ? <Video className="w-5 h-5 text-accent" /> : <Phone className="w-5 h-5 text-accent" />}
        </div>
        <div>
          <div className="text-sm font-bold text-text">{chatName}</div>
          <div className="text-xs text-text-muted flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            {fmt(duration)} · {allParticipants.length} participant{allParticipants.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setMinimized(false)} className="p-2 rounded-xl bg-bg-hover hover:bg-bg-active text-text-muted transition-all" title="Expand">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={hangUp} className="p-2 rounded-xl bg-error text-white hover:bg-red-600 transition-all" title="Hang up">
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex items-center justify-center ${fullscreen ? '' : 'bg-black/80 backdrop-blur-md'}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`bg-[#0d1b14] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden ${
          fullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-3xl'
        }`}
        style={{ maxHeight: fullscreen ? '100vh' : '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <div className="font-bold text-white text-base">{chatName}</div>
            <div className="text-xs text-white/50 flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-success animate-pulse' :
                status === 'failed' ? 'bg-error' : 'bg-warning animate-pulse'
              }`} />
              {status === 'connected' ? fmt(duration) : status === 'failed' ? 'Connection failed' : 'Connecting...'}
              <span>·</span>
              <span>{mode === 'video' ? '📹 Video' : '🎙️ Voice'} call</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowParticipants((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all ${showParticipants ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
            >
              <Users className="w-3.5 h-3.5" />
              {allParticipants.length}
            </button>
            <button onClick={() => setMinimized(true)} className="p-2 rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Minimise">
              <Minus className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className="p-2 rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition-all" title="Fullscreen">
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Video/audio grid */}
          <div className={`flex-1 p-4 grid gap-3 content-start overflow-y-auto ${gridCols}`}>
            {allParticipants.map((p) => (
              <ParticipantTile
                key={p.userId}
                participant={p}
                isLocal={p.isLocal}
                mode={mode}
                volume={volume}
                isSpeaking={activeSpeaker === p.userId}
              />
            ))}
          </div>

          {/* Participant list sidebar */}
          <AnimatePresence>
            {showParticipants && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 200, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-l border-white/10 bg-white/5 overflow-hidden shrink-0"
              >
                <div className="p-3 text-xs font-bold text-white/50 uppercase tracking-wide">Participants</div>
                {allParticipants.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2 px-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {p.user?.avatar_url
                        ? <img src={p.user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        : <span className="text-xs font-bold text-white">{(p.user?.display_name || p.user?.username || '?')[0].toUpperCase()}</span>
                      }
                    </div>
                    <span className="text-sm text-white/80 truncate flex-1">{p.isLocal ? 'You' : p.user?.display_name || p.user?.username || '...'}</span>
                    {p.muted && <MicOff className="w-3 h-3 text-error shrink-0" />}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Join/leave log */}
        <AnimatePresence>
          {joinLeaveLog.length > 0 && (
            <div className="px-5 pb-1 space-y-1">
              {joinLeaveLog.map((e, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-white/40 text-center"
                >
                  {e.name} {e.action} the call
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 px-5 py-5 border-t border-white/10 shrink-0 flex-wrap">
          <ControlBtn
            active={muted}
            activeClass="bg-error/80 text-white"
            inactiveClass="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </ControlBtn>

          {mode === 'video' && (
            <ControlBtn
              active={videoOff}
              activeClass="bg-error/80 text-white"
              inactiveClass="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              onClick={toggleVideo}
              title={videoOff ? 'Turn on camera' : 'Turn off camera'}
              label={videoOff ? 'Start video' : 'Stop video'}
            >
              {videoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </ControlBtn>
          )}

          {mode === 'video' && (
            <ControlBtn
              active={sharing}
              activeClass="bg-accent/80 text-white"
              inactiveClass="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              onClick={toggleShare}
              title={sharing ? 'Stop sharing' : 'Share screen'}
              label={sharing ? 'Stop share' : 'Share'}
            >
              {sharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
            </ControlBtn>
          )}

          {/* Volume control */}
          <div className="relative">
            <ControlBtn
              active={volume === 0}
              activeClass="bg-white/20 text-white"
              inactiveClass="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              onClick={() => setShowVolume((v) => !v)}
              title="Volume"
              label="Volume"
            >
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </ControlBtn>
            <AnimatePresence>
              {showVolume && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a2e22] border border-white/10 rounded-2xl p-3 shadow-xl"
                  style={{ width: 48 }}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => applyVolume(Number(e.target.value))}
                    className="w-24 cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 80, width: 6 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Hang up */}
          <button
            onClick={hangUp}
            className="w-14 h-14 rounded-full bg-error hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg hover:shadow-xl hover:scale-105"
            title="Hang up"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          <ControlBtn
            active={false}
            activeClass=""
            inactiveClass="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            onClick={() => setMinimized(true)}
            title="Minimise"
            label="Minimise"
          >
            <ChevronDown className="w-5 h-5" />
          </ControlBtn>
        </div>
      </motion.div>
    </div>
  )
}

// ── Participant tile ───────────────────────────────────────────────────────────

function ParticipantTile({
  participant,
  isLocal,
  mode,
  volume,
  isSpeaking,
}: {
  participant: { userId: string; user: AppUser | null; stream: MediaStream | null; muted?: boolean; videoOff?: boolean }
  isLocal: boolean
  mode: 'voice' | 'video'
  volume: number
  isSpeaking: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream
    }
  }, [participant.stream])

  // Attach remote audio to audio element (critical fix: audio must be in a real element)
  useEffect(() => {
    if (!isLocal && audioRef.current && participant.stream) {
      audioRef.current.srcObject = participant.stream
      audioRef.current.volume = volume
      // Handle autoplay restrictions
      const playPromise = audioRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay blocked — user interaction needed; audio will play on next interaction
        })
      }
    }
  }, [participant.stream, isLocal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const name = participant.user?.display_name || participant.user?.username || 'Unknown'
  const showVideo = mode === 'video' && participant.stream && !participant.videoOff

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-white/5 border flex items-center justify-center min-h-[140px] transition-all duration-200 ${
      isSpeaking ? 'border-accent shadow-lg shadow-accent/20' : 'border-white/10'
    }`}>
      {/* Remote audio — always present, hidden */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          data-remote-audio="true"
          className="hidden"
        />
      )}

      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 px-4">
          {participant.user?.avatar_url ? (
            <img src={participant.user.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover ring-4 ring-white/10" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center ring-4 ring-white/10">
              <span className="text-3xl font-bold text-accent">{name[0]?.toUpperCase()}</span>
            </div>
          )}
          {/* Voice activity animation */}
          {!participant.muted && (
            <div className="flex gap-1 items-end h-5">
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: isSpeaking ? [1, 2, 1] : [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                  className="w-1 rounded-full bg-accent/60"
                  style={{ height: 8 + i * 2 }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Name + mute badge */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-xs font-bold text-white bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-sm">
          {isLocal ? 'You' : name}
        </span>
        {participant.muted && (
          <span className="bg-error/80 rounded-full p-1.5 backdrop-blur-sm">
            <MicOff className="w-3 h-3 text-white" />
          </span>
        )}
      </div>
    </div>
  )
}

// ── Control button ─────────────────────────────────────────────────────────────

function ControlBtn({
  children,
  active,
  activeClass,
  inactiveClass,
  onClick,
  title,
  label,
}: {
  children: React.ReactNode
  active: boolean
  activeClass: string
  inactiveClass: string
  onClick: () => void
  title: string
  label?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        title={title}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-105 ${active ? activeClass : inactiveClass}`}
      >
        {children}
      </button>
      {label && <span className="text-xs text-white/40">{label}</span>}
    </div>
  )
}

// ── Incoming call notification ─────────────────────────────────────────────────

interface IncomingCallProps {
  from: AppUser
  chatName: string
  mode: 'voice' | 'video'
  onAccept: () => void
  onDecline: () => void
}

export function IncomingCallNotification({ from, chatName, mode, onAccept, onDecline }: IncomingCallProps) {
  const [ringMuted, setRingMuted] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: -80, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -80, scale: 0.92 }}
      transition={{ type: 'spring', damping: 22, stiffness: 300 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-bg-surface border border-border rounded-3xl shadow-2xl px-5 py-4 flex items-center gap-4 w-full max-w-md"
      style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 0 0 4px rgba(90,140,110,0.12)' }}
    >
      {/* Pulsing ring */}
      <div className="relative shrink-0">
        <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
        <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center overflow-hidden relative">
          {from.avatar_url
            ? <img src={from.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
            : <span className="text-2xl font-bold text-accent">{(from.display_name || from.username)[0].toUpperCase()}</span>
          }
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-bold text-text text-base leading-tight">{from.display_name || from.username}</div>
        <div className="text-sm text-text-muted mt-0.5">
          {mode === 'video' ? '📹 Incoming video call' : '🎙️ Incoming voice call'}
        </div>
        <div className="text-xs text-text-muted/60 mt-0.5">{chatName}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setRingMuted((m) => !m)}
          className={`p-2 rounded-xl transition-all text-xs ${ringMuted ? 'bg-bg-active text-text-muted' : 'bg-bg-hover text-text-muted hover:text-text'}`}
          title={ringMuted ? 'Unmute ring' : 'Mute ring'}
        >
          {ringMuted ? '🔕' : '🔔'}
        </button>
        <button
          onClick={onDecline}
          className="w-11 h-11 rounded-full bg-error text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-sm"
          title="Decline"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
        <button
          onClick={onAccept}
          className="w-11 h-11 rounded-full bg-success text-white flex items-center justify-center hover:bg-green-600 transition-all shadow-sm"
          title="Accept"
        >
          <Phone className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  )
}
