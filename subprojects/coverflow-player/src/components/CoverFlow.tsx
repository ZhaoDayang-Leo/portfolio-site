import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { albums, initialAlbumIndex } from '../data/albums'
import {
  scrollToAlbumIndex,
  updateAlbumTransforms,
} from '../utils/coverflow3d'
import AlbumItem from './AlbumItem'
import BottomBar from './BottomBar'
import HandGestureControls from './HandGestureControls'
import '../styles/coverflow.css'

const INITIAL_INDEX = initialAlbumIndex
const USE_EXTERNAL_AUDIO =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('externalAudio') === '1'

interface LyricLine {
  time: number
  text: string
}

function parseLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = []

  raw.split(/\r?\n/).forEach((line) => {
    if (line.trim().startsWith('{')) return

    const timestamps = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    const text = line.replace(/\[[^\]]+\]/g, '').trim()
    if (!text || timestamps.length === 0) return

    timestamps.forEach((match) => {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = Number((match[3] ?? '0').padEnd(3, '0').slice(0, 3)) / 1000
      lines.push({ time: minutes * 60 + seconds + fraction, text })
    })
  })

  return lines.sort((a, b) => a.time - b.time)
}

export default function CoverFlow() {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const didDragRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number | null>(null)
  const handInertiaRafRef = useRef<number | null>(null)
  const handVelocityRef = useRef(0)
  const selectedIndexRef = useRef(INITIAL_INDEX)
  const shouldResumePlaybackRef = useRef(false)
  const skipNextAudioResetRef = useRef(false)
  const autoplayTimerRef = useRef<number | null>(null)
  const centerPlaybackTimerRef = useRef<number | null>(null)
  const playbackRetryTimerRef = useRef<number | null>(null)
  const programmaticSelectionTimerRef = useRef<number | null>(null)
  const programmaticSelectionRef = useRef<number | null>(null)
  const featuredIndexRef = useRef<number | null>(null)
  const hasUserInteractedRef = useRef(false)
  const playbackWantedRef = useRef(false)
  const [selectedIndex, setSelectedIndex] = useState(INITIAL_INDEX)
  const [featuredIndex, setFeaturedIndex] = useState<number | null>(null)
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [activeLyricIndex, setActiveLyricIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isHandGestureActive, setIsHandGestureActive] = useState(false)
  const selectedAlbum = albums[selectedIndex] ?? albums[0]
  const featuredAlbum = featuredIndex === null ? null : albums[featuredIndex]

  const notifyParentCommand = useCallback((command: string) => {
    window.parent?.postMessage({ type: 'coverflow-user-command', command }, '*')
  }, [])

  const broadcastPlayerState = useCallback((albumIndex = selectedIndexRef.current) => {
    const album = albums[albumIndex] ?? albums[0]
    const audio = USE_EXTERNAL_AUDIO ? null : audioRef.current
    window.parent?.postMessage(
      {
        type: 'coverflow-state',
        album: {
          id: album.id,
          index: albumIndex,
          title: album.title,
          artist: album.artist,
          imageUrl: album.imageUrl,
          audioUrl: album.audioUrl,
        },
        isPlaying: USE_EXTERNAL_AUDIO ? playbackWantedRef.current : audio ? !audio.paused : isPlaying,
        currentTime: audio?.currentTime ?? 0,
        duration: Number.isFinite(audio?.duration) ? audio?.duration : 0,
      },
      '*',
    )
  }, [isPlaying])

  const clearPlaybackTimers = useCallback(() => {
    if (autoplayTimerRef.current !== null) {
      window.clearTimeout(autoplayTimerRef.current)
      autoplayTimerRef.current = null
    }
    if (centerPlaybackTimerRef.current !== null) {
      window.clearTimeout(centerPlaybackTimerRef.current)
      centerPlaybackTimerRef.current = null
    }
    if (playbackRetryTimerRef.current !== null) {
      window.clearTimeout(playbackRetryTimerRef.current)
      playbackRetryTimerRef.current = null
    }
  }, [])

  const stopAlbumAudio = useCallback(() => {
    playbackWantedRef.current = false
    shouldResumePlaybackRef.current = false
    skipNextAudioResetRef.current = false
    clearPlaybackTimers()
    if (USE_EXTERNAL_AUDIO) {
      setIsPlaying(false)
      broadcastPlayerState()
      return
    }
    audioRef.current?.pause()
    setIsPlaying(false)
    broadcastPlayerState()
  }, [broadcastPlayerState, clearPlaybackTimers])

  const getItems = useCallback((): HTMLElement[] => {
    return itemRefs.current.filter((el): el is HTMLDivElement => el !== null)
  }, [])

  const update3D = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const items = getItems()
    updateAlbumTransforms(container, items, featuredIndexRef.current)

    const containerCenter = container.scrollLeft + container.clientWidth / 2
    let closestIndex = selectedIndexRef.current
    let closestDistance = Number.POSITIVE_INFINITY
    items.forEach((item) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2
      const distance = Math.abs(itemCenter - containerCenter)
      const index = itemRefs.current.indexOf(item as HTMLDivElement)
      if (index >= 0 && distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })
    if (programmaticSelectionRef.current !== null) {
      return
    }

    if (closestIndex !== selectedIndexRef.current) {
      selectedIndexRef.current = closestIndex
      setSelectedIndex(closestIndex)
    }
  }, [getItems])

  const stopHandInertia = useCallback(() => {
    if (handInertiaRafRef.current !== null) {
      window.cancelAnimationFrame(handInertiaRafRef.current)
      handInertiaRafRef.current = null
    }
    handVelocityRef.current = 0
  }, [])

  const startHandInertia = useCallback(() => {
    if (handInertiaRafRef.current !== null || featuredIndexRef.current !== null) return

    const tick = () => {
      const container = containerRef.current
      if (!container || featuredIndexRef.current !== null) {
        stopHandInertia()
        return
      }

      handVelocityRef.current *= 0.92
      if (Math.abs(handVelocityRef.current) < 0.32) {
        stopHandInertia()
        return
      }

      container.scrollLeft += handVelocityRef.current
      update3D()
      handInertiaRafRef.current = window.requestAnimationFrame(tick)
    }

    handInertiaRafRef.current = window.requestAnimationFrame(tick)
  }, [stopHandInertia, update3D])

  useEffect(() => {
    featuredIndexRef.current = featuredIndex
    update3D()
  }, [featuredIndex, update3D])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scheduleUpdate = () => {
      if (rafRef.current !== null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        update3D()
      })
    }

    const onScroll = () => {
      if (featuredIndexRef.current !== null) {
        return
      }
      scheduleUpdate()
    }
    const onResize = () => scheduleUpdate()

    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    const initTimer = window.setTimeout(() => {
      const targetItem = itemRefs.current[INITIAL_INDEX]
      if (targetItem) {
        scrollToAlbumIndex(container, targetItem)
        scheduleUpdate()
      }
    }, 50)

    let isDown = false
    let dragStartX = 0
    let dragScrollLeft = 0

    const onMouseDown = (e: MouseEvent) => {
      if (featuredIndexRef.current !== null) return
      stopHandInertia()
      isDown = true
      didDragRef.current = false
      hasUserInteractedRef.current = true
      container.classList.add('active')
      dragStartX = e.pageX - container.offsetLeft
      dragScrollLeft = container.scrollLeft
    }

    const onMouseLeave = () => {
      isDown = false
    }

    const onMouseUp = () => {
      isDown = false
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown || featuredIndexRef.current !== null) return
      e.preventDefault()
      const x = e.pageX - container.offsetLeft
      const walk = (x - dragStartX) * 2
      if (Math.abs(walk) > 6) {
        didDragRef.current = true
      }
      container.scrollLeft = dragScrollLeft - walk
      scheduleUpdate()
    }

    container.addEventListener('mousedown', onMouseDown)
    container.addEventListener('mouseleave', onMouseLeave)
    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('mousemove', onMouseMove)

    return () => {
      window.clearTimeout(initTimer)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (autoplayTimerRef.current !== null) {
        window.clearTimeout(autoplayTimerRef.current)
        autoplayTimerRef.current = null
      }
      if (centerPlaybackTimerRef.current !== null) {
        window.clearTimeout(centerPlaybackTimerRef.current)
        centerPlaybackTimerRef.current = null
      }
      if (playbackRetryTimerRef.current !== null) {
        window.clearTimeout(playbackRetryTimerRef.current)
        playbackRetryTimerRef.current = null
      }
      if (programmaticSelectionTimerRef.current !== null) {
        window.clearTimeout(programmaticSelectionTimerRef.current)
        programmaticSelectionTimerRef.current = null
      }
      stopHandInertia()
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      container.removeEventListener('mousedown', onMouseDown)
      container.removeEventListener('mouseleave', onMouseLeave)
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('mousemove', onMouseMove)
    }
  }, [stopHandInertia, update3D])

  const centerAlbum = useCallback((index: number) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }

    const container = containerRef.current
    const targetItem = itemRefs.current[index]
    if (!container || !targetItem) return
    hasUserInteractedRef.current = true
    selectedIndexRef.current = index
    setSelectedIndex(index)
    scrollToAlbumIndex(container, targetItem, 'smooth')
    window.setTimeout(() => {
      featuredIndexRef.current = index
      setFeaturedIndex(index)
    }, 140)
  }, [])

  const closeFeature = useCallback(() => {
    featuredIndexRef.current = null
    setFeaturedIndex(null)
    setLyrics([])
    setActiveLyricIndex(0)
    update3D()
  }, [update3D])

  const playAlbumAudio = useCallback((index: number) => {
    if (USE_EXTERNAL_AUDIO) {
      selectedIndexRef.current = index
      playbackWantedRef.current = true
      setIsPlaying(true)
      broadcastPlayerState(index)
      return
    }
    const audio = audioRef.current
    const album = albums[index]
    if (!audio || !album?.audioUrl) {
      setIsPlaying(false)
      return
    }
    playbackWantedRef.current = true

    const albumAudioHref = new URL(album.audioUrl, window.location.href).href
    const isSameTrack = audio.currentSrc === albumAudioHref
    const attemptPlayback = () => {
      if (!playbackWantedRef.current || audio.currentSrc !== albumAudioHref) return
      void audio.play().then(
        () => setIsPlaying(true),
        () => {
          if (playbackWantedRef.current) setIsPlaying(false)
        },
      )
    }

    if (playbackRetryTimerRef.current !== null) {
      window.clearTimeout(playbackRetryTimerRef.current)
      playbackRetryTimerRef.current = null
    }

    skipNextAudioResetRef.current = true
    if (!isSameTrack) {
      audio.src = album.audioUrl
      audio.load()
    } else {
      audio.currentTime = 0
    }

    attemptPlayback()

    const retryPlayback = (delay: number) => {
      playbackRetryTimerRef.current = window.setTimeout(() => {
        playbackRetryTimerRef.current = null
        if (playbackWantedRef.current && audio.paused && audio.currentSrc === albumAudioHref) {
          attemptPlayback()
        }
      }, delay)
    }

    retryPlayback(isSameTrack ? 160 : 420)
    window.setTimeout(() => {
      if (playbackWantedRef.current && audio.paused && audio.currentSrc === albumAudioHref) {
        attemptPlayback()
      }
    }, 900)
  }, [broadcastPlayerState])

  const queueCenterPlayback = useCallback((index: number, delay = 420) => {
    if (centerPlaybackTimerRef.current !== null) {
      window.clearTimeout(centerPlaybackTimerRef.current)
      centerPlaybackTimerRef.current = null
    }

    centerPlaybackTimerRef.current = window.setTimeout(() => {
      centerPlaybackTimerRef.current = null
      if (featuredIndexRef.current !== null) return
      const audio = audioRef.current
      const album = albums[index]
      const albumAudioHref =
        album?.audioUrl && typeof window !== 'undefined'
          ? new URL(album.audioUrl, window.location.href).href
          : ''
      if (!playbackWantedRef.current) return
      if (audio && albumAudioHref && !audio.paused && audio.currentSrc === albumAudioHref) return
      playAlbumAudio(index)
    }, delay)
  }, [playAlbumAudio])

  const goToAlbum = useCallback((nextIndex: number, shouldPlay = false) => {
    const normalizedIndex = (nextIndex + albums.length) % albums.length
    const container = containerRef.current
    const targetItem = itemRefs.current[normalizedIndex]
    hasUserInteractedRef.current = true
    shouldResumePlaybackRef.current = shouldPlay
    if (programmaticSelectionTimerRef.current !== null) {
      window.clearTimeout(programmaticSelectionTimerRef.current)
      programmaticSelectionTimerRef.current = null
    }
    programmaticSelectionRef.current = normalizedIndex
    selectedIndexRef.current = normalizedIndex
    setSelectedIndex(normalizedIndex)

    if (container && targetItem) {
      scrollToAlbumIndex(container, targetItem, 'smooth')
    }

    if (featuredIndexRef.current !== null) {
      featuredIndexRef.current = normalizedIndex
      setFeaturedIndex(normalizedIndex)
      window.setTimeout(update3D, 80)
    }

    if (shouldPlay) {
      playAlbumAudio(normalizedIndex)
      shouldResumePlaybackRef.current = false
    }

    programmaticSelectionTimerRef.current = window.setTimeout(() => {
      programmaticSelectionRef.current = null
      programmaticSelectionTimerRef.current = null
      update3D()
    }, 620)
  }, [playAlbumAudio, update3D])

  const goToPreviousAlbum = useCallback(() => {
    if (USE_EXTERNAL_AUDIO) notifyParentCommand('previous')
    goToAlbum(selectedIndexRef.current - 1, true)
  }, [goToAlbum, notifyParentCommand])

  const goToNextAlbum = useCallback(() => {
    if (USE_EXTERNAL_AUDIO) notifyParentCommand('next')
    goToAlbum(selectedIndexRef.current + 1, true)
  }, [goToAlbum, notifyParentCommand])

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false)
    goToAlbum(selectedIndexRef.current + 1, true)
  }, [goToAlbum])

  useEffect(() => {
    queueCenterPlayback(selectedIndex, selectedIndex === INITIAL_INDEX ? 620 : 480)
  }, [queueCenterPlayback, selectedIndex])

  useEffect(() => {
    if (USE_EXTERNAL_AUDIO) return
    playbackWantedRef.current = true
    const startPlayback = () => {
      playAlbumAudio(selectedIndexRef.current)
    }
    const timer = window.setTimeout(startPlayback, 180)
    const gestureEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    const handleGesture = () => {
      if (!playbackWantedRef.current || audioRef.current?.paused) {
        startPlayback()
      }
      if (audioRef.current && !audioRef.current.paused) {
        gestureEvents.forEach((type) => window.removeEventListener(type, handleGesture))
      }
    }
    gestureEvents.forEach((type) => window.addEventListener(type, handleGesture, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      gestureEvents.forEach((type) => window.removeEventListener(type, handleGesture))
    }
  }, [playAlbumAudio])

  const handleHandPan = useCallback((deltaX: number) => {
    const container = containerRef.current
    if (!container || featuredIndexRef.current !== null) return
    hasUserInteractedRef.current = true
    stopHandInertia()
    const scrollDelta = -deltaX * container.clientWidth * 0.52
    container.scrollLeft += scrollDelta
    handVelocityRef.current = scrollDelta
    update3D()
  }, [stopHandInertia, update3D])

  const handleHandPanEnd = useCallback(() => {
    if (Math.abs(handVelocityRef.current) > 1.2) {
      startHandInertia()
    }
  }, [startHandInertia])

  const getAlbumIndexAtScreenX = useCallback((screenX: number) => {
    let closestIndex = selectedIndexRef.current
    let closestDistance = Number.POSITIVE_INFINITY

    itemRefs.current.forEach((item, index) => {
      const wrapper = item?.querySelector<HTMLElement>('.album-wrapper')
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const containsX = screenX >= rect.left && screenX <= rect.right
      const distance = containsX ? 0 : Math.abs(screenX - centerX)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    return closestIndex
  }, [])

  const handleHandPickLift = useCallback((screenX: number) => {
    if (featuredIndexRef.current !== null) return
    stopHandInertia()
    centerAlbum(getAlbumIndexAtScreenX(screenX))
  }, [centerAlbum, getAlbumIndexAtScreenX, stopHandInertia])

  const togglePlayback = useCallback(() => {
    if (USE_EXTERNAL_AUDIO) {
      notifyParentCommand('toggle')
      setIsPlaying((playing) => {
        playbackWantedRef.current = !playing
        return !playing
      })
      return
    }
    const audio = audioRef.current
    if (!audio || !selectedAlbum.audioUrl) return
    hasUserInteractedRef.current = true

    if (audio.paused) {
      playbackWantedRef.current = true
      void audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      )
    } else {
      stopAlbumAudio()
    }
  }, [notifyParentCommand, selectedAlbum.audioUrl, stopAlbumAudio])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'coverflow-command') return
      const command = event.data.command
      if (command === 'toggle') {
        if (USE_EXTERNAL_AUDIO) {
          setIsPlaying((playing) => {
            playbackWantedRef.current = !playing
            return !playing
          })
        } else {
          togglePlayback()
        }
      } else if (command === 'next') {
        goToAlbum(selectedIndexRef.current + 1, true)
      } else if (command === 'previous') {
        goToAlbum(selectedIndexRef.current - 1, true)
      } else if (command === 'play') {
        playAlbumAudio(selectedIndexRef.current)
      } else if (command === 'pause') {
        stopAlbumAudio()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [goToAlbum, playAlbumAudio, stopAlbumAudio, togglePlayback])

  useEffect(() => {
    const audio = audioRef.current
    if (autoplayTimerRef.current !== null) {
      window.clearTimeout(autoplayTimerRef.current)
      autoplayTimerRef.current = null
    }

    const shouldResume = shouldResumePlaybackRef.current
    shouldResumePlaybackRef.current = false
    const selectedAudioHref =
      selectedAlbum.audioUrl && typeof window !== 'undefined'
        ? new URL(selectedAlbum.audioUrl, window.location.href).href
        : ''
    const shouldSkipReset = skipNextAudioResetRef.current && audio?.currentSrc === selectedAudioHref
    skipNextAudioResetRef.current = false
    if (shouldSkipReset) {
      return
    }

    const isAlreadyPlayingSelectedTrack =
      !!audio &&
      !!selectedAudioHref &&
      !audio.paused &&
      audio.currentSrc === selectedAudioHref

    if (isAlreadyPlayingSelectedTrack) {
      setIsPlaying(true)
      return
    }

    setIsPlaying(shouldResume)
    playbackWantedRef.current = shouldResume

    if (audio) {
      audio.autoplay = shouldResume
      audio.pause()
      audio.currentTime = 0
      audio.load()
    }

    if (!audio || !selectedAlbum.audioUrl || !shouldResume) return

    const resumePlayback = () => {
      if (!playbackWantedRef.current) return
      void audio.play().then(
        () => setIsPlaying(true),
        () => {
          if (playbackWantedRef.current) setIsPlaying(false)
        },
      )
    }

    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resumePlayback()
    } else {
      audio.addEventListener('canplay', resumePlayback, { once: true })
    }

    return () => {
      if (autoplayTimerRef.current !== null) {
        window.clearTimeout(autoplayTimerRef.current)
        autoplayTimerRef.current = null
      }
      audio.removeEventListener('canplay', resumePlayback)
    }
  }, [selectedAlbum.audioUrl])

  useEffect(() => {
    let isCancelled = false
    setLyrics([])
    setActiveLyricIndex(0)

    if (!featuredAlbum?.lyricUrl) return

    fetch(featuredAlbum.lyricUrl)
      .then((response) => response.text())
      .then((text) => {
        if (!isCancelled) {
          setLyrics(parseLyrics(text))
        }
      })
      .catch(() => {
        if (!isCancelled) setLyrics([])
      })

    return () => {
      isCancelled = true
    }
  }, [featuredAlbum?.lyricUrl])

  const updateActiveLyric = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (lyrics.length === 0) {
      broadcastPlayerState()
      return
    }

    const currentTime = audio.currentTime
    let nextIndex = 0
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) {
        nextIndex = i
      } else {
        break
      }
    }
    setActiveLyricIndex(nextIndex)
    broadcastPlayerState()
  }, [broadcastPlayerState, lyrics])

  const shellStyle = {
    '--active-cover': `url('${selectedAlbum.imageUrl}')`,
  } as CSSProperties

  useEffect(() => {
    broadcastPlayerState(selectedIndex)
  }, [broadcastPlayerState, isPlaying, selectedIndex])

  useEffect(() => {
    window.parent?.postMessage({ type: 'coverflow-featured', active: Boolean(featuredAlbum) }, '*')
  }, [featuredAlbum])

  return (
    <div
      className={`coverflow-shell h-screen w-screen flex flex-col relative select-none ${featuredAlbum ? 'has-featured-album' : ''} ${isPlaying ? 'is-playing' : ''} ${isHandGestureActive ? 'is-hand-gesture-active' : ''}`}
      style={shellStyle}
    >
      <main
        ref={containerRef}
        id="scroll-container"
        className="flex-1 w-full overflow-x-auto overflow-y-visible snap-x snap-mandatory no-scrollbar relative cursor-grab active:cursor-grabbing pb-24"
      >
        <div className="scroll-content flex items-center h-full w-max px-[calc(50vw-28px)] gap-0 pt-20">
          {albums.map((album, index) => (
            <AlbumItem
              key={album.id}
              ref={(el: HTMLDivElement | null) => {
                itemRefs.current[index] = el
              }}
              album={album}
              onSelect={() => centerAlbum(index)}
            />
          ))}
        </div>
      </main>
      <BottomBar
        album={selectedAlbum}
        isPlaying={isPlaying}
        onPlayPause={togglePlayback}
        onPrevious={goToPreviousAlbum}
        onNext={goToNextAlbum}
      />
      <HandGestureControls
        disabled={featuredIndex !== null}
        onActiveChange={setIsHandGestureActive}
        onPan={handleHandPan}
        onPanEnd={handleHandPanEnd}
        onPickLift={handleHandPickLift}
      />
      {featuredAlbum ? (
        <section className="album-feature-panel" aria-label={`${featuredAlbum.title} details`}>
          <button
            type="button"
            className="feature-close-button"
            aria-label="Close"
            onClick={closeFeature}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5z" />
            </svg>
          </button>
          <div className="feature-copy">
            <p className="feature-kicker">Now Showing</p>
            <h2>{featuredAlbum.title}</h2>
            <p className="feature-artist">{featuredAlbum.artist}</p>
            <div className="feature-lyrics" aria-label="Lyrics">
              {lyrics.length > 0 ? (
                <div
                  className="feature-lyrics-track"
                  style={{ transform: `translateY(${96 - activeLyricIndex * 34}px)` }}
                >
                  {lyrics.map((line, index) => (
                    <p
                      key={`${line.time}-${line.text}-${index}`}
                      className={index === activeLyricIndex ? 'active' : ''}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p>暂无歌词</p>
              )}
            </div>
          </div>
        </section>
      ) : null}
      {!USE_EXTERNAL_AUDIO && selectedAlbum.audioUrl ? (
        <audio
          ref={audioRef}
          src={selectedAlbum.audioUrl}
          onEnded={handleAudioEnded}
          onTimeUpdate={updateActiveLyric}
          onLoadedMetadata={() => broadcastPlayerState()}
          onPlay={() => broadcastPlayerState()}
          onPause={() => broadcastPlayerState()}
        />
      ) : null}
    </div>
  )
}
