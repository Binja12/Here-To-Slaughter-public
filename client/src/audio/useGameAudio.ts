import { useEffect, useRef } from 'react'
import { GameLogEntry, PlayerView } from '../contract'
import { useAudio } from './AudioProvider'

/** Only new, confirmed events make sounds; the initial history stays silent. */
export function useGameAudio(view: PlayerView, log: GameLogEntry[]) {
  const { playSound, setMusic } = useAudio()
  const cursor = useRef<{ gameId: string; seq: number } | null>(null)
  const challenging = view.pendingWindows.some((window) =>
    window.type === 'Challenge' && window.detail?.challenged === true,
  )
  useEffect(() => { setMusic(challenging ? 'challenge' : 'gameplay') }, [challenging, setMusic])
  useEffect(() => {
    const latest = log[log.length - 1]?.seq ?? 0
    // Rebuild from confirmed history so reconnects, muted actions, and batched
    // snapshots all agree. Separate windows keep independent pitch ladders.
    const modifierCounts = new Map<string, number>()
    for (const entry of log) {
      let level = 1
      if (entry.sound === 'modifierPlayed' && entry.soundWindowId) {
        level = Math.min(10, (modifierCounts.get(entry.soundWindowId) ?? 0) + 1)
        modifierCounts.set(entry.soundWindowId, level)
      }
      if (cursor.current?.gameId === view.gameId && entry.seq > cursor.current.seq && entry.sound) {
        playSound(entry.sound, level)
      }
    }
    cursor.current = { gameId: view.gameId, seq: latest }
  }, [view.gameId, log, playSound])
}
