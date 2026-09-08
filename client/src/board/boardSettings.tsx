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
  /** GREEN — a card you may play, a reaction still live under a question. */
  auraPlay: boolean
  /** PINK — a card whose standing rule is in force. */
  auraEffect: boolean
  /** RED — an opponent acting, and the screen's rim while you are the target. */
  auraTarget: boolean
  /** GOLD — the thing the engine is asking you to press, right now. */
  auraInstant: boolean
  /**
   * Answer for me, the way I almost always would (lazyChoice.ts). Off by
   * default: it presses buttons on the player's behalf, and nothing does that
   * unless it was asked to.
   */
  lazyChoice: boolean
}

const DEFAULTS: BoardSettings = {
  stickyHand: false,
  auraPlay: true,
  auraEffect: true,
  auraTarget: true,
  auraInstant: true,
  lazyChoice: false,
}
const STORAGE_KEY = 'htsr.boardSettings'

function saved(): BoardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULTS
    const stored = JSON.parse(raw) as Partial<BoardSettings> & { glowEffects?: boolean }
    // `glowEffects` was the one switch these four replaced; a board that had it
    // OFF keeps every aura off rather than silently lighting up again.
    const legacy = stored.glowEffects
    const aura = (value: boolean | undefined, fallback: boolean) =>
      value ?? (legacy === undefined ? fallback : legacy)
    return {
      stickyHand: stored.stickyHand ?? DEFAULTS.stickyHand,
      auraPlay: aura(stored.auraPlay, DEFAULTS.auraPlay),
      auraEffect: aura(stored.auraEffect, DEFAULTS.auraEffect),
      auraTarget: aura(stored.auraTarget, DEFAULTS.auraTarget),
      auraInstant: aura(stored.auraInstant, DEFAULTS.auraInstant),
      lazyChoice: stored.lazyChoice ?? DEFAULTS.lazyChoice,
    }
  } catch {
    return DEFAULTS
  }
}

/** The board-root classes these settings switch on. One per aura, in tone order. */
export function auraClasses(settings: BoardSettings): string {
  return [
    settings.auraPlay ? '' : ' no-aura-play',
    settings.auraEffect ? '' : ' no-aura-effect',
    settings.auraTarget ? '' : ' no-aura-target',
    settings.auraInstant ? '' : ' no-aura-instant',
  ].join('')
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
