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
                label="Glow effects"
                hint="The coloured auras — green playable, gold asked, pink passive, red opponent. Off, the board tells you nothing and you read it yourself."
                checked={settings.glowEffects}
                onChange={(value) => set('glowEffects', value)}
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

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-900/70 bg-zinc-900/60 px-3 py-2">
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
    </label>
  )
}
