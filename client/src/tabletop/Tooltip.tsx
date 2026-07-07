import React, { useId } from 'react'

// Lightweight CSS tooltip. Wraps any inline content; the tip renders above
// (or below) on hover *and* keyboard focus so disabled-reason text stays
// reachable without a mouse.

type TooltipProps = {
  text?: string
  side?: 'top' | 'bottom'
  block?: boolean
  children: React.ReactNode
}

export default function Tooltip({
  text,
  side = 'top',
  block = false,
  children,
}: TooltipProps) {
  const id = useId()
  if (!text) return <>{children}</>
  return (
    <span
      className={`ttip ${block ? 'ttip-block' : ''}`}
      tabIndex={-1}
      aria-describedby={id}
    >
      {children}
      <span role="tooltip" id={id} className={`ttip-bubble ttip-${side}`}>
        {text}
      </span>
    </span>
  )
}
