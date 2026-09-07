import { useEffect } from 'react'
import { assetUrl } from '../assetUrl'
import { catalog, musicPlaylist } from './catalog'
import { imageUrl } from './AssetImage'
import { backgroundTraffic } from './traffic'

export const loadGameScreen = () => import('../GameScreen')
export const loadLobbyView = () => import('../lobby/LobbyView')

const lobbyFiles = [
  'Background Empty.png', 'Center Frame.png', 'Player Frame.png',
  'Settings.png', 'Button Start Game.png', 'add player.png', 'remove player.png',
].map((name) => `/lobby/${name}`)
const boardFiles = [
  'Table Background.png', 'Heroes Frame.png', 'Leader Card Frame.png',
  'Small Card Back Frame.png', 'Big Card Frame.png', 'Center Border Frame.png',
  'Action Pointer Border.png', 'Action Point Gem.png', 'Your Turn Show.png',
  'End Turn Button.png', 'Skip Reaction Button.png', 'Redraw Button.png',
].map((name) => `/board/Border Widgets/${name}`)

// Public filenames only. Neither the shuffled deck nor hidden player state
// enters speculative loading; every match uses this same order.
export const gameImageFiles = () => Object.keys(catalog.images)
  .filter((file) => file.startsWith('/board/') || file.startsWith('/music/Volume ')).sort()

export function useAssetWarmup(screen: 'checking' | 'auth' | 'lobby' | 'game' | 'game-connecting') {
  useEffect(() => {
    const controller = new AbortController()
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const constrained = connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')
    backgroundTraffic.setEnabled(false)
    const warm = (url: string, priority: number) => {
      void backgroundTraffic.request(url, priority, controller.signal).catch(() => {})
    }
    const scheduledImages = new Set<string>()
    const warmImage = (path: string, priority: number) => {
      // A checkout without generated assets should not prefetch hundreds of MB
      // of master PNGs. Visible assets still use the original fallback normally.
      if (catalog.images[path] && !scheduledImages.has(path)) {
        scheduledImages.add(path)
        warm(imageUrl(path), priority)
      }
    }
    let planned = false
    const start = () => {
      backgroundTraffic.setEnabled(!document.hidden && screen !== 'checking' && screen !== 'game-connecting')
      if (planned || document.hidden || constrained || screen === 'checking' || screen === 'game-connecting') return
      planned = true
      if (screen !== 'game') {
        void loadLobbyView().catch(() => {})
        lobbyFiles.forEach((file) => warmImage(file, 0))
      }
      boardFiles.forEach((file) => warmImage(file, 10))
      gameImageFiles().forEach((file) => warmImage(file, 20))
      Object.keys(catalog.files).filter((file) => file.startsWith('/sound effects/') && !file.includes('music'))
        .forEach((file) => warm(assetUrl(file), 30))
      let volume = 50
      try { volume = Number(localStorage.getItem('htsr.volume') ?? 50) } catch { /* Storage may be disabled. */ }
      const first = musicPlaylist('/music/Gameplay Music.mp3')?.[0]
      if (screen !== 'game' && volume > 0 && first) warm(first.url, 40)
      // The game chunk is useful during the wait, but not before the lobby art.
      const lastLobby = lobbyFiles[lobbyFiles.length - 1]
      if (screen !== 'game' && catalog.images[lastLobby]) {
        void backgroundTraffic.request(imageUrl(lastLobby), 1, controller.signal)
          .then(() => { if (!controller.signal.aborted) return loadGameScreen() }).catch(() => {})
      }
    }
    const timer = window.setTimeout(start, 500)
    const visibility = () => start()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibility)
      controller.abort()
      backgroundTraffic.setEnabled(false)
    }
  }, [screen])
}
