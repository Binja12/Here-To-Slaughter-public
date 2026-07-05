import React from 'react'
import './board.css'

/** Faceted action-point gems with an at-a-glance numeric readout. */
export default function ActionPointDisplay(props: {
  current: number
  max: number
}) {
  return (
    <div className="ap-display" title="Action points">
      <div className="ap-gems">
        {Array.from({ length: props.max }).map((_, i) => (
          <span key={i} className={`ap-gem ${i < props.current ? 'ap-gem-full' : ''}`} />
        ))}
      </div>
      <span className="ap-readout">
        {props.current}/{props.max}
      </span>
    </div>
  )
}
