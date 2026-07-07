import React from 'react'
import { CrossedSwordsIcon } from './icons'

type TurnBannerProps = {
  isMyTurn: boolean
  currentPlayerName: string
  accent: string
}

export default function TurnBanner({
  isMyTurn,
  currentPlayerName,
  accent,
}: TurnBannerProps) {
  return (
    <div
      className={`turn-banner ${isMyTurn ? 'turn-banner-mine' : ''}`}
      style={{ '--accent': accent } as React.CSSProperties}
      role="status"
    >
      <span className="turn-banner-text">
        {isMyTurn ? 'Your Turn' : `${currentPlayerName}’s Turn`}
      </span>
      <span className="turn-banner-emblem">
        <CrossedSwordsIcon size={26} color={isMyTurn ? '#f0c75e' : '#8d8375'} />
      </span>
    </div>
  )
}
