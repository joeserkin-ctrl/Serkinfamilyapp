import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: {
      transcript: string
    }
  }>
}

interface VoiceComposerProps {
  onTranscript: (value: string) => void
  large?: boolean
}

export function VoiceComposer({ onTranscript, large = false }: VoiceComposerProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [listening, setListening] = useState(false)
  const supported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)

  useEffect(() => {
    const SpeechRecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionApi) {
      return
    }

    const recognition = new SpeechRecognitionApi()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
      onTranscript(transcript)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition

    return () => {
      recognition.stop()
    }
  }, [onTranscript])

  if (!supported) {
    return (
      <p className="text-sm text-stone-500">
        Voice capture is available in supported browsers. You can still type the memory below.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!recognitionRef.current) {
          return
        }

        if (listening) {
          recognitionRef.current.stop()
          setListening(false)
          return
        }

        recognitionRef.current.start()
        setListening(true)
      }}
      className={large
        ? 'rounded-3xl border border-stone-900/15 bg-orange-300 px-5 py-4 text-base font-semibold text-stone-950 transition hover:bg-orange-200'
        : 'rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition hover:border-stone-900/30'}
    >
      {listening ? 'Stop voice capture' : 'Use voice input'}
    </button>
  )
}