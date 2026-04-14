import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttachmentKind } from '../types/family'

interface MediaRecorderCaptureProps {
  kind: Extract<AttachmentKind, 'audio' | 'video'>
  onCapture: (payload: {
    blob: Blob
    kind: Extract<AttachmentKind, 'audio' | 'video'>
    mimeType: string
    suggestedName: string
  }) => Promise<void> | void
  large?: boolean
}

function getPreferredMimeType(kind: 'audio' | 'video') {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function getExtension(mimeType: string, kind: 'audio' | 'video') {
  if (mimeType.includes('mp4')) {
    return 'mp4'
  }
  if (mimeType.includes('ogg')) {
    return 'ogg'
  }
  if (kind === 'audio') {
    return 'webm'
  }
  return 'webm'
}

function getCaptureLabel(kind: 'audio' | 'video', isRecording: boolean) {
  if (kind === 'audio') {
    return isRecording ? 'Stop voice recording' : 'Record voice note in app'
  }

  return isRecording ? 'Stop video recording' : 'Record video snippet in app'
}

export function MediaRecorderCapture({ kind, onCapture, large = false }: MediaRecorderCaptureProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)

  const [error, setError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  const detachPreview = useCallback(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null
    }
  }, [])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    detachPreview()
  }, [detachPreview])

  useEffect(() => stopTracks, [stopTracks])

  if (!supported) {
    return (
      <p className="text-sm text-stone-500">
        In-app recording is available in supported browsers. Uploads still work everywhere else.
      </p>
    )
  }

  async function startRecording() {
    setError('')
    setIsBusy(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video',
      })

      streamRef.current = stream

      if (kind === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
      }

      const preferredMimeType = getPreferredMimeType(kind)
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      mediaRecorder.onerror = () => {
        setError('Recording failed. Please try again.')
        setIsBusy(false)
        setIsRecording(false)
        stopTracks()
      }
      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || preferredMimeType || `${kind}/webm`
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const extension = getExtension(mimeType, kind)

        try {
          await onCapture({
            blob,
            kind,
            mimeType,
            suggestedName: `${kind}-capture-${Date.now()}.${extension}`,
          })
        } catch {
          setError('The recording finished, but the file could not be attached.')
        } finally {
          chunksRef.current = []
          setIsBusy(false)
          setIsRecording(false)
          stopTracks()
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setIsBusy(false)
    } catch {
      setError('Microphone or camera access was blocked. Check browser permissions and try again.')
      setIsBusy(false)
      setIsRecording(false)
      stopTracks()
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      stopTracks()
      setIsRecording(false)
      return
    }

    setIsBusy(true)
    mediaRecorderRef.current.stop()
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => {
          if (isRecording) {
            stopRecording()
            return
          }

          void startRecording()
        }}
        className={large
          ? 'rounded-3xl border border-stone-900/15 bg-stone-950 px-5 py-4 text-base font-semibold text-stone-50 transition enabled:hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60'
          : 'rounded-full border border-stone-900/15 bg-stone-950 px-4 py-2 text-sm font-medium text-stone-50 transition enabled:hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60'}
      >
        {isBusy ? 'Working...' : getCaptureLabel(kind, isRecording)}
      </button>

      {kind === 'video' && isRecording && (
        <div className="overflow-hidden rounded-3xl border border-stone-900/10 bg-stone-950">
          <video ref={videoPreviewRef} autoPlay muted playsInline className="aspect-video w-full object-cover" />
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}