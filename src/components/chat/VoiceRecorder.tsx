import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'

interface VoiceRecorderProps {
  channelId: string
  onClose: () => void
}

export function VoiceRecorder({ channelId, onClose }: VoiceRecorderProps) {
  const { user } = useAuthStore()
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<number[]>([])
  const [sending, setSending] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animRef = useRef<number>(0)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
        audioCtx.close()
      }
      recorder.start()
      chunksRef.current = []
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000) as unknown as ReturnType<typeof setInterval>

      // Record waveform
      const recordWaveform = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
        setWaveform((prev) => [...prev.slice(-50), avg])
        animRef.current = requestAnimationFrame(recordWaveform)
      }
      recordWaveform()
    } catch (err) {
      toast.error('Microphone access denied')
      onClose()
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
      cancelAnimationFrame(animRef.current ?? 0)
    }
  }

  const sendVoiceMessage = async () => {
    if (!audioBlob || !user) return
    setSending(true)
    const fileName = `${user.id}/${Date.now()}-voice.webm`
    try {
      const { data, error } = await supabase.storage.from('voice').upload(fileName, audioBlob, { contentType: 'audio/webm' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('voice').getPublicUrl(data.path)

      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: channelId,
        user_id: user.id,
        content: '',
        message_type: 'voice',
        attachment_url: publicUrl,
        attachment_name: 'voice.webm',
        attachment_size: audioBlob.size,
        attachment_metadata: { duration, waveform: waveform.slice(0, 40) },
      })

      if (msgError) throw msgError
      toast.success('Voice message sent!')
      onClose()
    } catch (err) {
      toast.error('Failed to send voice message')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      cancelAnimationFrame(animRef.current ?? 0)
    }
  }, [])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Voice Message</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!audioUrl ? (
          <div className="text-center py-8">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-all ${isRecording ? 'bg-error animate-pulse' : 'bg-error hover:scale-110'}`}
            >
              {isRecording ? (
                <div className="w-6 h-6 bg-white rounded" />
              ) : (
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              )}
            </button>
            <p className="mt-4 text-text-muted text-sm">
              {isRecording ? `Recording... ${formatTime(duration)}` : 'Tap to start recording'}
            </p>

            {/* Live waveform */}
            {isRecording && waveform.length > 0 && (
              <div className="flex items-center justify-center gap-0.5 h-12 mt-4">
                {waveform.map((h, i) => (
                  <div
                    key={i}
                    className="w-1 bg-primary rounded-full transition-all"
                    style={{ height: `${Math.max(h * 100, 10)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-4">
            <audio src={audioUrl} controls className="w-full mb-4" />
            <p className="text-center text-text-muted text-sm mb-4">Duration: {formatTime(duration)}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setAudioBlob(null); setAudioUrl(null); setWaveform([]); setDuration(0) }}
                className="btn-ghost flex-1"
              >
                Re-record
              </button>
              <button onClick={sendVoiceMessage} disabled={sending} className="btn-primary flex-1 disabled:opacity-50">
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
