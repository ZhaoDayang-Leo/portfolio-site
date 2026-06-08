import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'

interface HandGestureControlsProps {
  disabled: boolean
  onPan: (deltaX: number) => void
  onPanEnd: () => void
  onPickLift: (screenX: number) => void
  onActiveChange?: (active: boolean) => void
}

type GestureState = 'idle' | 'tracking' | 'pinching' | 'lifting' | 'error'
type LoadState = 'off' | 'loading' | 'ready' | 'error'

const TASKS_VISION_VERSION = '0.10.35'

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export default function HandGestureControls({
  disabled,
  onPan,
  onPanEnd,
  onPickLift,
  onActiveChange,
}: HandGestureControlsProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastXRef = useRef<number | null>(null)
  const pinchStartYRef = useRef<number | null>(null)
  const didLiftRef = useRef(false)
  const lastGestureStateRef = useRef<GestureState>('idle')
  const smoothedIndicatorRef = useRef<{ x: number; y: number } | null>(null)
  const indicatorRef = useRef({
    isPinching: false,
    isVisible: false,
    x: 0,
    y: 0,
  })
  const [enabled, setEnabled] = useState(false)
  const [gestureState, setGestureState] = useState<GestureState>('idle')
  const [loadState, setLoadState] = useState<LoadState>('off')
  const [indicator, setIndicator] = useState({
    isPinching: false,
    isVisible: false,
    x: 0,
    y: 0,
  })

  const updateGestureState = (nextState: GestureState) => {
    if (lastGestureStateRef.current === nextState) return
    lastGestureStateRef.current = nextState
    setGestureState(nextState)
  }

  useEffect(() => {
    if (!enabled || disabled) return

    let isCancelled = false

    const stop = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      if (lastXRef.current !== null) {
        onPanEnd()
      }
      lastXRef.current = null
      pinchStartYRef.current = null
      didLiftRef.current = false
      smoothedIndicatorRef.current = null
      const nextIndicator = { ...indicatorRef.current, isPinching: false, isVisible: false }
      indicatorRef.current = nextIndicator
      setIndicator(nextIndicator)
    }

    const run = async () => {
      try {
        setGestureState('tracking')
        setLoadState('loading')
        const [{ FilesetResolver, HandLandmarker: HandLandmarkerClass }, stream] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false,
          }),
        ])

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        await new Promise<void>((resolve) => {
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            resolve()
            return
          }
          video.onloadedmetadata = () => resolve()
        })
        await video.play()

        const vision = await FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`,
        )
        const baseOptions = {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        }
        const landmarker = await HandLandmarkerClass.createFromOptions(vision, {
          baseOptions: { ...baseOptions, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        }).catch(() =>
          HandLandmarkerClass.createFromOptions(vision, {
            baseOptions: { ...baseOptions, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 1,
          }),
        )
        landmarkerRef.current = landmarker
        setLoadState('ready')
        updateGestureState('tracking')

        const tick = () => {
          if (isCancelled || !landmarkerRef.current || !videoRef.current) return

          const result = landmarkerRef.current.detectForVideo(videoRef.current, performance.now())
          const hand = result.landmarks[0]

          if (!hand) {
            if (lastXRef.current !== null) {
              onPanEnd()
            }
            lastXRef.current = null
            pinchStartYRef.current = null
            didLiftRef.current = false
            smoothedIndicatorRef.current = null
            const nextIndicator = { ...indicatorRef.current, isPinching: false, isVisible: false }
            indicatorRef.current = nextIndicator
            setIndicator(nextIndicator)
            updateGestureState('tracking')
            rafRef.current = window.requestAnimationFrame(tick)
            return
          }

          const thumbTip = hand[4]
          const indexTip = hand[8]
          const wrist = hand[0]
          const pinchDistance = distance(thumbTip, indexTip)
          const pinchX = (thumbTip.x + indexTip.x) / 2
          const pinchY = (thumbTip.y + indexTip.y) / 2
          const handScale = Math.max(distance(hand[0], hand[9]), 0.12)
          const isPinching = pinchDistance < handScale * 0.46
          const rawIndicator = {
            x: (1 - pinchX) * window.innerWidth,
            y: pinchY * window.innerHeight,
          }
          const previousIndicator = smoothedIndicatorRef.current
          const smoothing = isPinching ? 0.09 : 0.16
          const smoothedIndicator = previousIndicator
            ? {
                x: previousIndicator.x + (rawIndicator.x - previousIndicator.x) * smoothing,
                y: previousIndicator.y + (rawIndicator.y - previousIndicator.y) * smoothing,
              }
            : rawIndicator
          smoothedIndicatorRef.current = smoothedIndicator
          const nextIndicator = {
            isPinching,
            isVisible: true,
            x: smoothedIndicator.x,
            y: smoothedIndicator.y,
          }
          const previous = indicatorRef.current
          const moved = Math.hypot(nextIndicator.x - previous.x, nextIndicator.y - previous.y)
          const stateChanged =
            nextIndicator.isPinching !== previous.isPinching ||
            nextIndicator.isVisible !== previous.isVisible

          if (stateChanged || moved > 1.8) {
            indicatorRef.current = nextIndicator
            setIndicator(nextIndicator)
          }

          if (isPinching) {
            if (lastXRef.current !== null) {
              onPanEnd()
            }
            lastXRef.current = null
            if (pinchStartYRef.current === null) {
              pinchStartYRef.current = pinchY
              didLiftRef.current = false
            }

            const liftAmount = pinchStartYRef.current - pinchY
            if (!didLiftRef.current && liftAmount > 0.14) {
              didLiftRef.current = true
              updateGestureState('lifting')
              onPickLift((1 - pinchX) * window.innerWidth)
            } else {
              updateGestureState(didLiftRef.current ? 'lifting' : 'pinching')
            }
          } else {
            pinchStartYRef.current = null
            didLiftRef.current = false
            const palmX = (pinchX + wrist.x) / 2
            if (lastXRef.current !== null) {
              const deltaX = palmX - lastXRef.current
              if (Math.abs(deltaX) > 0.0015) {
                onPan(deltaX)
              }
            }
            lastXRef.current = palmX
            updateGestureState('tracking')
          }

          rafRef.current = window.requestAnimationFrame(tick)
        }

        tick()
      } catch {
        stop()
        setEnabled(false)
        setLoadState('error')
        setGestureState('error')
      }
    }

    void run()

    return () => {
      isCancelled = true
      stop()
    }
  }, [disabled, enabled, onPan, onPanEnd, onPickLift])

  useEffect(() => {
    if (disabled && enabled) {
      setEnabled(false)
    }
  }, [disabled, enabled])

  useEffect(() => {
    onActiveChange?.(enabled && !disabled)
  }, [disabled, enabled, onActiveChange])

  const label =
    loadState === 'loading'
      ? 'Loading'
      : gestureState === 'pinching'
      ? 'Pinch'
      : gestureState === 'lifting'
        ? 'Lift'
        : loadState === 'error' || gestureState === 'error'
          ? 'Camera'
          : enabled
            ? 'Ready'
            : 'Hand'
  const indicatorStyle = {
    '--hand-x': `${indicator.x}px`,
    '--hand-y': `${indicator.y}px`,
  } as CSSProperties

  return (
    <div className="hand-gesture-control">
      <video ref={videoRef} className={`hand-gesture-video ${enabled ? 'active' : ''}`} playsInline muted />
      <div
        className={`hand-pinch-indicator ${indicator.isVisible ? 'visible' : ''} ${indicator.isPinching ? 'pinching' : ''} ${gestureState === 'lifting' ? 'lifting' : ''}`}
        style={indicatorStyle}
        aria-hidden
      />
      <button
        type="button"
        className={`hand-gesture-button ${enabled ? 'active' : ''}`}
        disabled={disabled}
        onClick={() => setEnabled((current) => !current)}
      >
        <span className="hand-gesture-dot" />
        {label}
      </button>
    </div>
  )
}
