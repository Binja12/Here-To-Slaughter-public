import React from 'react'
import { render, screen, within } from '@testing-library/react'
import GameLogMenu from './GameLogMenu'

const at = new Date(2026, 8, 5, 14, 3, 9).getTime()

describe('GameLogMenu', () => {
  it('lists the story newest first with a clock on each line', () => {
    render(
      <GameLogMenu
        entries={[
          { seq: 1, at, playerId: '', text: 'The game begins' },
          { seq: 2, at: at + 1000, playerId: 'alice', text: "Alice's turn" },
          { seq: 3, at: at + 2000, playerId: 'alice', text: 'Alice drew a card' },
        ]}
      />,
    )

    expect(screen.getByText('Game log')).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'Game log' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      '14:03:11Alice drew a card',
      "14:03:10Alice's turn",
      '14:03:09The game begins',
    ])
  })

  it('says so when nothing has happened yet', () => {
    render(<GameLogMenu entries={[]} />)
    expect(screen.getByText('Nothing has happened yet')).toBeInTheDocument()
  })
})
