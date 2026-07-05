import React from 'react'
import './board.css'

/**
 * The physical game table: felt play surface inside a carved-wood frame with
 * brass pinstriping and corner medallions. Purely presentational — all
 * gameplay zones render as children on the surface.
 */
export default function BoardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="board-frame">
      <div className="board-frame-corner corner-tl" />
      <div className="board-frame-corner corner-tr" />
      <div className="board-frame-corner corner-bl" />
      <div className="board-frame-corner corner-br" />
      <div className="board-surface">{children}</div>
    </div>
  )
}
