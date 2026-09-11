import React from 'react'
import { render } from '@testing-library/react'
import HeroRow from './HeroRow'
import { midGame } from '../fixtures/views'

// The row lays its heroes out two ways — spread while it has room, fanned
// once it fills — and an aura must reach the card either way.

const heroes = midGame.parties.flatMap((party) => party.heroes)

const askAuras = (count: number) => {
  const asked = heroes.slice(0, count).map((_, i) => i === count - 1)
  const { container } = render(
    <HeroRow heroes={heroes.slice(0, count)} seat="bottom" asked={asked} />,
  )
  return container.querySelectorAll('.ask-aura').length
}

test('the asked hero wears the gold aura in the spread row', () => {
  expect(heroes.length).toBeGreaterThanOrEqual(5)
  expect(askAuras(2)).toBe(1)
})

test('the asked hero wears the gold aura in the fanned row too', () => {
  expect(askAuras(5)).toBe(1)
})
