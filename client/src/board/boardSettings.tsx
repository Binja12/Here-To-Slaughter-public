import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * The player's OWN screen settings — how this browser draws the table, never
 * anything the table agrees on. They are kept here and in localStorage; the
 * server neither sends nor hears about them.
 *
 * The volume is deliberately NOT one of these: AudioProvider owns it (and its
 * own storage key), and the settings panel shows that same control rather than
 * a second copy of the number.
 */
export type BoardSettings = {
  /**
   * The hand opens on a PRESS of the stack and stays open until the felt is
   * pressed. Off: the hover fan, which is the board's own behaviour.
   */
  stickyHand: boolean
  /**
   * The coloured auras — green playable, gold ask, pink passive, red enemy.
   * Off, the board says nothing and the player reads it themselves; the
   * targeting/challenge DIM stays either way, because that is what shows
   * which half of the table a card is being aimed at.
   */
  glowEffects: boolean
}

const DEFAULTS: BoardSettings = { stickyHand: false, glowEffects: true }
const STORAGE_KEY = 'htsr.boardSettings'

function saved(): BoardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULTS
    const stored = JSON.parse(raw) as Partial<BoardSettings>
    return {
      stickyHand: stored.stickyHand ?? DEFAULTS.stickyHand,
      glowEffects: stored.glowEffects ?? DEFAULTS.glowEffects,
    }
  } catch {
    return DEFAULTS
  }
}

const BoardSettingsContext = createContext<{
  settings: BoardSettings
  set: <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]) => void
}>({ settings: DEFAULTS, set: () => {} })

export const useBoardSettings = () => useContext(BoardSettingsContext)

export function BoardSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<BoardSettings>(saved)
  const set = useCallback(
    <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]) => {
      setSettings((current) => {
        const next = { ...current, [key]: value }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* Storage may be disabled. */
        }
        return next
      })
    },
    [],
  )
  const value = useMemo(() => ({ settings, set }), [settings, set])
  return (
    <BoardSettingsContext.Provider value={value}>
      {children}
    </BoardSettingsContext.Provider>
  )
}
