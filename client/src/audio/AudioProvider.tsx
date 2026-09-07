import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../assetUrl'
import { musicPlaylist } from '../loading/catalog'
import { backgroundTraffic } from '../loading/traffic'
import { MusicTrack } from './MusicTrack'

export const SOUND_FILES = {
  heroPlayed: '/sound effects/hero played.mp3',
  modifierPlayed: '/sound effects/modifier sound.mp3',
  monsterSlain: '/sound effects/monster slain.mp3',
  skipReaction: '/sound effects/skip reaction.mp3',
  discardHover: '/sound effects/Discard Hover.mp3',
  turnStart: '/sound effects/Turn Start.mp3',
} as const
export type Sound = keyof typeof SOUND_FILES
type Music = 'gameplay' | 'challenge'
type MusicRequest = { kind: Music; restartKey?: string }
const MUSIC_FILES = { gameplay: '/music/Gameplay Music.mp3', challenge: '/music/Challenge music.mp3' }
const STORAGE_KEY = 'htsr.volume'
const MUSIC_GAIN = 0.28
const MUSIC_FADE_MS = 1000
const MUSIC_KINDS: Music[] = ['gameplay', 'challenge']

function savedVolume() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const value = saved === null ? 50 : Number(saved)
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50
  } catch { return 50 }
}

const AudioContext = createContext({
  volume: 50,
  setVolume: (_value: number) => {},
  playSound: (_sound: Sound, _modifierLevel = 1) => {},
  setMusic: (_music: Music, _restartKey?: string) => {},
})
export const useAudio = () => useContext(AudioContext)

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [volume, updateVolume] = useState(savedVolume)
  const [musicRequest, updateMusic] = useState<MusicRequest>({ kind: 'gameplay' })
  const setMusic = useCallback((kind: Music, restartKey?: string) => {
    updateMusic((previous) => previous.kind === kind && previous.restartKey === restartKey
      ? previous : { kind, restartKey })
  }, [])
  const volumeRef = useRef(volume)
  const tracks = useRef<Partial<Record<Music, MusicTrack>>>({})
  const effects = useRef(new Set<HTMLAudioElement>())
  const currentMusic = useRef<Music>('gameplay')
  const musicLevels = useRef<Record<Music, number>>({ gameplay: 1, challenge: 0 })
  const fadeTimer = useRef<number | null>(null)
  const transitionId = useRef(0)
  const pendingMusic = useRef<Music | null>(null)

  const applyMusicVolume = useCallback(() => {
    for (const kind of MUSIC_KINDS) {
      const track = tracks.current[kind]
      if (track) track.volume = volumeRef.current / 100 * MUSIC_GAIN * musicLevels.current[kind]
    }
  }, [])

  const cancelTransition = useCallback(() => {
    transitionId.current += 1
    pendingMusic.current = null
    if (fadeTimer.current !== null) window.clearInterval(fadeTimer.current)
    fadeTimer.current = null
  }, [])

  const setVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return
    const next = Math.max(0, Math.min(100, Math.round(value)))
    volumeRef.current = next
    updateVolume(next)
    Object.values(tracks.current).forEach((track) => track?.setMuted(next === 0))
    applyMusicVolume()
    effects.current.forEach((effect) => { effect.volume = next / 100 })
    try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* Storage may be disabled. */ }
  }, [applyMusicVolume])

  const resumeMusic = useCallback(() => {
    if (document.hidden || backgroundTraffic.busy) return
    const incoming = currentMusic.current
    const track = tracks.current[incoming]
    if (!track || fadeTimer.current !== null || pendingMusic.current === incoming) return
    if (!track.paused && musicLevels.current[incoming] === 1) return
    const id = ++transitionId.current
    pendingMusic.current = incoming
    // Keep the outgoing track audible until the incoming one can actually play.
    // A blocked play retries on a gesture, without fading into silence.
    void track.play().then(() => {
      if (id !== transitionId.current) return
      pendingMusic.current = null
      const from = { ...musicLevels.current }
      if (from[incoming] === 1) return
      const started = Date.now()
      const tick = () => {
        const progress = Math.min(1, (Date.now() - started) / MUSIC_FADE_MS)
        const eased = progress * progress * (3 - 2 * progress)
        for (const kind of MUSIC_KINDS) {
          const target = kind === incoming ? 1 : 0
          musicLevels.current[kind] = from[kind] + (target - from[kind]) * eased
        }
        applyMusicVolume()
        if (progress === 1) {
          if (fadeTimer.current !== null) window.clearInterval(fadeTimer.current)
          fadeTimer.current = null
          for (const kind of MUSIC_KINDS) {
            if (kind !== incoming) tracks.current[kind]?.pause()
          }
        }
      }
      fadeTimer.current = window.setInterval(tick, 16)
    }).catch(() => {
      if (id === transitionId.current) pendingMusic.current = null
    })
  }, [applyMusicVolume])

  useEffect(() => {
    const created = tracks.current
    for (const kind of MUSIC_KINDS) {
      const file = MUSIC_FILES[kind]
      const track = new MusicTrack(musicPlaylist(file) ?? [{ url: assetUrl(file), startSeconds: 0, durationSeconds: 0 }], assetUrl(file))
      track.setMuted(volumeRef.current === 0)
      track.volume = volumeRef.current / 100 * MUSIC_GAIN * musicLevels.current[kind]
      created[kind] = track
    }
    const activeEffects = effects.current
    const visibility = () => {
      if (document.hidden) {
        cancelTransition()
        Object.values(created).forEach((track) => track?.pause())
        musicLevels.current = { gameplay: 0, challenge: 0 }
        applyMusicVolume()
        activeEffects.forEach((effect) => effect.pause())
        activeEffects.clear()
      } else resumeMusic()
    }
    document.addEventListener('pointerdown', resumeMusic)
    document.addEventListener('keydown', resumeMusic)
    document.addEventListener('visibilitychange', visibility)
    const unsubscribe = backgroundTraffic.onIdle(resumeMusic)
    resumeMusic()
    return () => {
      cancelTransition()
      document.removeEventListener('pointerdown', resumeMusic)
      document.removeEventListener('keydown', resumeMusic)
      document.removeEventListener('visibilitychange', visibility)
      unsubscribe()
      Object.values(created).forEach((track) => track?.dispose())
      activeEffects.forEach((effect) => effect.pause())
      activeEffects.clear()
      tracks.current = {}
    }
  }, [resumeMusic, cancelTransition, applyMusicVolume])

  useEffect(() => {
    const music = musicRequest.kind
    // Every new challenge/modifier cue starts its music at the beginning.
    // Never seek gameplay: pausing it after the fade preserves its place.
    if (music === 'challenge' && tracks.current.challenge) tracks.current.challenge.currentTime = 0
    if (currentMusic.current !== music) {
      cancelTransition()
      currentMusic.current = music
      for (const kind of MUSIC_KINDS) {
        if (kind !== music && musicLevels.current[kind] === 0) tracks.current[kind]?.pause()
      }
    }
    resumeMusic()
  }, [musicRequest, resumeMusic, cancelTransition])

  const playSound = useCallback((sound: Sound, modifierLevel = 1) => {
    if (volumeRef.current === 0 || document.hidden) return
    // Bound overlap during rapid actions; each one-shot cleans itself up.
    if (effects.current.size >= 8) {
      const oldest = effects.current.values().next().value as HTMLAudioElement
      oldest.pause()
      effects.current.delete(oldest)
    }
    const effect = new Audio(assetUrl(SOUND_FILES[sound]))
    effect.volume = volumeRef.current / 100
    if (sound === 'modifierPlayed') {
      const level = Number.isFinite(modifierLevel) ? Math.max(1, Math.min(10, Math.floor(modifierLevel))) : 1
      // Two semitones per card, with the first at the original pitch.
      effect.preservesPitch = false
      effect.playbackRate = 2 ** ((level - 1) / 6)
    }
    effects.current.add(effect)
    const release = () => { effects.current.delete(effect) }
    effect.onended = release
    effect.onerror = release
    void effect.play().catch(release)
  }, [])

  return <AudioContext.Provider value={{ volume, setVolume, playSound, setMusic }}>{children}</AudioContext.Provider>
}
