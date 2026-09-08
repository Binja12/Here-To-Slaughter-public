import AssetImage from '../loading/AssetImage'
import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import GameConfigMenu from './GameConfigMenu'
import GameLogMenu from './GameLogMenu'
import VolumeControl from '../audio/VolumeControl'
import { HUD } from './layout'
import { useBoardSettings } from './boardSettings'
import type { GameConfigView, GameLogEntry } from '../contract'

/**
 * The settings panel behind the gear (the owner, 2026-09-07): the table's own
 * settings (the game config and the log, which used to float over the board's
 * top-left corner) and this player's screen settings together in one place.
 *
 * `dim-exempt` throughout, and above the reaction overlays, so it opens over a
 * challenge or a modifier window the way it opens over the bare table.
 */
export default function SettingsMenu({
  config,
  log,
}: {
  config?: GameConfigView
  log: GameLogEntry[]
}) {
  const [open, setOpen] = useState(false)
  const { settings, set } = useBoardSettings()
  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        className="dim-exempt h-full w-full transition-transform duration-[120ms] ease-out hover:scale-110 active:scale-95"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((shown) => !shown)
        }}
      >
        <AssetImage
          src={HUD.settings}
          alt=""
          aria-hidden
          draggable={false}
          className="h-full w-full object-contain drop-shadow-[0_0_0.35cqw_rgba(0,0,0,0.85)] hover:drop-shadow-[0_0_0.55cqw_rgba(255,190,70,0.95)]"
        />
      </button>

      {/* Into the body: the gear lives in a HUD slot, and a transformed
          ancestor turns `position: fixed` into `absolute` against that slot,
          which squeezed the panel into a 20px strip. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[86vh] w-[min(92vw,30rem)] overflow-y-auto rounded-xl border border-amber-600/70 bg-zinc-950 p-5 text-amber-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg text-amber-300">Settings</h2>
              <button
                type="button"
                aria-label="Close settings"
                className="rounded border border-amber-700/70 px-2 py-0.5 text-sm hover:bg-amber-900/60"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <Section title="Sound">
              {/* the SAME control as the board's, on the one volume the
                  AudioProvider holds — not a second copy of the number. It
                  sizes off its WIDTH (`.volume-control` is 100% wide at a
                  fixed aspect), so the box is given one. */}
              <div className="w-64">
                <VolumeControl />
              </div>
            </Section>

            <Section title="Board">
              <Toggle
                label="Togglable hand"
                hint="On: press your stack to open the fan; it stays open until you press the felt or a frame. Off: the fan follows the cursor."
                checked={settings.stickyHand}
                onChange={(value) => set('stickyHand', value)}
              />
              <Toggle
                label="Lazy Choice"
                hint="Answers the obvious reactions for you. Hover for the rules."
                rules={LAZY_RULES}
                checked={settings.lazyChoice}
                onChange={(value) => set('lazyChoice', value)}
              />
            </Section>

            <Section title="Auras">
              <Toggle
                label="Play aura"
                hint="Green — a card you may play right now."
                checked={settings.auraPlay}
                onChange={(value) => set('auraPlay', value)}
              />
              <Toggle
                label="Effects aura"
                hint="Pink — a card whose standing rule is in force."
                checked={settings.auraEffect}
                onChange={(value) => set('auraEffect', value)}
              />
              <Toggle
                label="Target aura"
                hint="Red — an opponent acting, and the screen's rim while their roll is aimed at you."
                checked={settings.auraTarget}
                onChange={(value) => set('auraTarget', value)}
              />
              <Toggle
                label="Instant play aura"
                hint="Gold — the card, seat or monster the engine is asking you to press."
                checked={settings.auraInstant}
                onChange={(value) => set('auraInstant', value)}
              />
            </Section>

            <Section title="This game">
              <GameConfigMenu config={config} />
              <GameLogMenu entries={log} />
            </Section>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-2 font-heading text-sm uppercase tracking-widest text-amber-400/80">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/**
 * Every answer Lazy Choice gives, in the order lazyChoice.ts decides them.
 * Kept beside the switch rather than in a doc: the player turning it on is
 * exactly who needs to read it.
 */
const LAZY_RULES = [
  'A modifier value on YOUR roll or attack: the highest.',
  "One on somebody else's: the lowest.",
  "In a challenge: the biggest impact on the gap — the plus on your own roll, the minus on your opponent's. Level values go to the plus, on yours. Not in the challenge? You play it as the challenger would.",
  '"You may draw a card?": yes.',
  '"Steal it instead" over "Destroy it": the hero leaves either way.',
  'A roll of yours that already beats its requirement: skip.',
  "An enemy's roll that has already failed: skip.",
  'No modifier or challenge card in hand to answer with: skip.',
  'Nothing else, and nothing while a question of your own is waiting.',
  'Hold SHIFT as you press an action to play that whole exchange by hand.',
]

function Toggle({
  label,
  hint,
  rules,
  checked,
  onChange,
}: {
  label: string
  hint: string
  /** the full list, shown while the switch is hovered or focused */
  rules?: string[]
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="group relative flex cursor-pointer items-start gap-3 rounded-lg border border-amber-900/70 bg-zinc-900/60 px-3 py-2">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-heading text-sm">{label}</span>
        <span className="block text-xs leading-snug text-amber-100/60">{hint}</span>
      </span>
      {rules && (
        // Never takes a click — it covers the switch it belongs to, and a
        // pop-up that swallowed the press would make the toggle unusable.
        <span
          role="note"
          className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-full rounded-lg border border-amber-500/70 bg-zinc-950 px-3 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.95)] group-hover:block group-focus-within:block"
        >
          <span className="mb-1 block font-heading text-xs uppercase tracking-wide text-amber-300">
            What it answers
          </span>
          {rules.map((rule) => (
            <span key={rule} className="mb-0.5 block text-xs leading-snug text-amber-100/80">
              • {rule}
            </span>
          ))}
        </span>
      )}
    </label>
  )
}
