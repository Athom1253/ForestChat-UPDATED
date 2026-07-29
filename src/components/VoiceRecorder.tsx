import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration } from '../lib/utils'

interface VoiceRecorderProps {
  chatId: string
  userId?: string
  onClose: () => void
}

const NUM_BARS = 32

export default function VoiceRecorder({ chatId, userId, onClose }: VoiceRecorderProps) {
  const [visible, setVisible] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingComplete, setRecordingComplete] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<number[]>(() => Array(NUM_BARS).fill(0))

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const finalDurationRef = useRef<number>(0)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    return () => {
      cleanup()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending && !recording) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending, recording])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    analyserRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  const updateWaveform = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    const bars: number[] = []
    const step = Math.floor(data.length / NUM_BARS)
    for (let i = 0; i < NUM_BARS; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0
      }
      const avg = sum / step / 255
      bars.push(Math.max(0.1, avg))
    }
    setWaveform(bars)
    rafRef.current = requestAnimationFrame(updateWaveform)
  }, [])

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 128
      source.connect(analyser)
      analyserRef.current = analyser

      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        finalDurationRef.current = (Date.now() - startTimeRef.current) / 1000
        setRecordingComplete(true)
        setWaveform((prev) => prev.map((v) => (v < 0.1 ? 0.1 : v)))
      }
      mr.start()
      startTimeRef.current = Date.now()
      setRecording(true)
      setRecordingComplete(false)
      setElapsed(0)
      setWaveform(Array(NUM_BARS).fill(0.1))

      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startTimeRef.current) / 1000)
      }, 100)

      rafRef.current = requestAnimationFrame(updateWaveform)
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Microphone access denied or unavailable.')
      cleanup()
    }
  }

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
    setRecording(false)
  }, [])

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    cleanup()
    setRecording(false)
    setRecordingComplete(false)
    setElapsed(0)
    setWaveform(Array(NUM_BARS).fill(0))
  }, [cleanup])

  const handleSend = async () => {
    if (sending || !recordingComplete) return
    setSending(true)
    setError(null)
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const fileName = `${Date.now()}.webm`
      const filePath = `voice/${chatId}/${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, blob, { contentType: 'audio/webm' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath)
      const url = urlData.publicUrl
      const duration = finalDurationRef.current
      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: chatId,
        user_id: userId ?? null,
        content: 'Voice message',
        message_type: 'voice',
        attachments: [{ type: 'voice', url, duration }],
      })
      if (msgError) throw msgError
      cleanup()
      onClose()
    } catch (err) {
      console.error('Failed to send voice message:', err)
      setError('Failed to send voice message. Please try again.')
      setSending(false)
    }
  }

  const handleRecordToggle = () => {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => !sending && !recording && onClose()}
      />
      <div
        className={`relative bg-night-900 border border-night-800 rounded-2xl shadow-2xl w-full max-w-md transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-night-800">
          <h3 className="text-lg font-semibold text-night-50 flex items-center gap-2">
            <MicIcon />
            Voice Message
          </h3>
          <button
            onClick={() => !sending && !recording && onClose()}
            disabled={sending || recording}
            className="p-1.5 rounded-lg text-night-400 hover:text-night-100 hover:bg-night-800 transition-colors disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleRecordToggle}
              disabled={sending || (recordingComplete && !recording)}
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${recording ? 'bg-red-600 hover:bg-red-500' : recordingComplete ? 'bg-forest-600 hover:bg-forest-500' : 'bg-forest-600 hover:bg-forest-500 hover:scale-105'}`}
            >
              {recording && (
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
              )}
              {recording ? (
                <span className="relative w-6 h-6 rounded bg-white" />
              ) : recordingComplete ? (
                <span className="relative">
                  <RecordAgainIcon />
                </span>
              ) : (
                <span className="relative">
                  <MicIcon large />
                </span>
              )}
            </button>

            <div className="text-center">
              <div className={`text-2xl font-mono font-semibold tabular-nums ${recording ? 'text-red-400 animate-pulse-soft' : 'text-night-100'}`}>
                {formatDuration(recording ? elapsed : finalDurationRef.current)}
              </div>
              <div className="text-xs text-night-400 mt-1">
                {recording ? 'Recording...' : recordingComplete ? 'Recording complete' : 'Tap to start recording'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1 h-16 px-4">
            {waveform.map((v, i) => (
              <div
                key={i}
                className={`waveform-bar ${recording ? 'text-forest-400' : recordingComplete ? 'text-forest-500' : 'text-night-600'}`}
                style={{ height: `${Math.max(4, v * 56)}px` }}
              />
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm animate-fade-in">
              <AlertIcon />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                if (recording) {
                  cancelRecording()
                } else {
                  onClose()
                }
              }}
              disabled={sending}
              className="px-4 py-2 text-sm font-medium text-night-300 hover:text-night-100 bg-night-800 hover:bg-night-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {recording ? 'Cancel Recording' : 'Close'}
            </button>
            <button
              onClick={handleSend}
              disabled={!recordingComplete || sending}
              className="px-5 py-2 text-sm font-medium text-white bg-forest-600 hover:bg-forest-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <>
                  <SpinnerIcon />
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon />
                  Send Voice
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MicIcon({ large }: { large?: boolean }) {
  const size = large ? 32 : 18
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={large ? 'text-white' : 'text-forest-400'}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function RecordAgainIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
