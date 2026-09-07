import { useEffect, useRef } from 'react'
import { GameLogEntry, PlayerView } from '../contract'
import { useAudio } from './AudioProvider'
import { bonusesOf } from '../board/liveRoll'
import { cardById } from '../board/viewTargets'

/** Only new, confirmed events make sounds; the initial history stays silent. */
export function useGameAudio(view: PlayerView, log: GameLogEntry[]) {
  const { playSound, setMusic } = useAudio()
  const cursor = useRef<{ gameId: string; seq: number } | null>(null)
  const challengeWindow = view.pendingWindows.find((window) =>
    window.type === 'Challenge' && window.detail?.challenged === true,
  )
  const modifiedWindow = view.pendingWindows.find((window) =>
    (window.type === 'Modifier' || window.type === 'Attack') && (
      bonusesOf(window.detail?.bonuses).some((bonus) => cardById(view, bonus.cardSource)?.type === 'Modifier') ||
      log.some((entry) => entry.sound === 'modifierPlayed' && entry.soundWindowId === window.windowId)
    ),
  )
  const musicWindowId = challengeWindow?.windowId ?? modifiedWindow?.windowId
  const lastModifierSeq = log.reduce((last, entry) => entry.sound === 'modifierPlayed' ? entry.seq : last, 0)
  const restartKey = musicWindowId ? `${view.gameId}:${musicWindowId}:${lastModifierSeq}` : undefined
  useEffect(() => {
    setMusic(restartKey ? 'challenge' : 'gameplay', restartKey)
  }, [restartKey, setMusic])
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

  // The turn coming ROUND to you, announced once. Read off the view rather
  // than the log: the turn passing is a state change, and a seat that joins
  // mid-turn must not hear a turn it did not start. The first view of a game
  // is silent for the same reason the log's history is (`mine` starts unset).
  const myTurn = view.currentPlayerId === view.playerId
  const wasMyTurn = useRef<boolean | null>(null)
  useEffect(() => {
    const before = wasMyTurn.current
    wasMyTurn.current = myTurn
    if (before === false && myTurn) playSound('turnStart')
  }, [myTurn, playSound])
}
