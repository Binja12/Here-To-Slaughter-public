import AssetImage from '../loading/AssetImage'
import React from 'react'

/** A painted HUD button (the owner's End Turn / Redraw / Skip art). */
export default function ImageButton({
  src,
  label,
  enabled,
  glow = false,
  onClick,
}: {
  src: string
  glow?: boolean
  label: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
      // A disabled painted button takes no clicks at all: its box is mostly
      // transparent padding, and swallowing the press there left a dead hole
      // over the felt — which is what the board reads to put a held-open hand
      // away (Board.pressedFelt).
      className="group relative h-full w-full transition-transform duration-[120ms] ease-out enabled:hover:scale-105 enabled:active:scale-95 disabled:pointer-events-none disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
    >
      <AssetImage
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className={`dimmable absolute inset-0 h-full w-full object-contain${glow ? ' skip-glow' : ''} group-enabled:group-hover:drop-shadow-[0_0_0.55cqw_rgba(255,190,70,0.95)]`}
      />
    </button>
  )
}
