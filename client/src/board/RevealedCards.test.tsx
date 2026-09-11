import React from 'react'
import { render, screen } from '@testing-library/react'
import RevealedCards from './RevealedCards'
import { midGame } from '../fixtures/views'
import type { PlayerView } from '../contract'

// A card shown on its own says nothing about whose look it is; the strip has
// to (the owner, 2026-09-07), and the viewer is "YOU" like everywhere else.
const shown = (extra: Partial<PlayerView>) =>
  render(<RevealedCards view={{ ...midGame, revealedCards: [midGame.hand[0]], ...extra }} />)

test('a look at a hand is captioned with whose hand it is', () => {
  shown({ revealedBy: midGame.playerId, revealedOf: midGame.seats[1].playerId })
  expect(screen.getByText(`${midGame.seats[1].name}'s hand`)).toBeInTheDocument()
})

test("your own hand being looked at reads as YOU, not your name", () => {
  shown({ revealedBy: midGame.seats[1].playerId, revealedOf: midGame.playerId })
  expect(screen.getByText("YOU's hand")).toBeInTheDocument()
})

test('a revealed draw names who revealed it', () => {
  shown({ revealedBy: midGame.seats[1].playerId })
  expect(screen.getByText(`${midGame.seats[1].name} revealed`)).toBeInTheDocument()
})

test('nothing revealed draws nothing at all', () => {
  const { container } = render(<RevealedCards view={{ ...midGame, revealedCards: [] }} />)
  expect(container).toBeEmptyDOMElement()
})
