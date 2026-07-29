import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'

interface VoiceMessagePlayerProps {
  url: string
  duration: number
  isOwn: boolean
}

export default function VoiceMessagePlayer({ url, duration, isOwn }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [realDuration, setRealDuration] = useState(duration)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => { setPlaying(false); setCurrentTime(0) }
    const onLoadedMetadata = () => {
      if (isFinite(audio.duration)) setRealDuration(audio.duration)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      await audio.play()
      setPlaying(true)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const t = Number(e.target.value)
    audio.currentTime = t
    setCurrentTime(t)
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = realDuration > 0 ? (currentTime / realDuration) * 100 : 0

  return (
    <div className={`flex items-center gap-3 py-1 min-w-[200px] ${isOwn ? 'text-white' : 'text-text'}`}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-accent/15 hover:bg-accent/25 text-accent'}`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative h-2">
          <div className={`absolute inset-0 rounded-full ${isOwn ? 'bg-white/20' : 'bg-accent/10'}`} />
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${isOwn ? 'bg-white' : 'bg-accent'}`}
            style={{ width: progress + '%' }}
          />
          <input
            type="range"
            min={0}
            max={realDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
          />
        </div>
        <div className="flex justify-between text-xs opacity-70">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(realDuration)}</span>
        </div>
      </div>
    </div>
  )
}
