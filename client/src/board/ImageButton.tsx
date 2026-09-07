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
      className="group relative h-full w-full transition-transform duration-[120ms] ease-out enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-50"
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
