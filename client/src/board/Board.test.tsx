import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Board from './Board'
import { GameProvider } from '../state/game'
import { CommandProvider } from '../state/commands'
import { PlayerView } from '../contract'
import { challengeWindowOpen, midGame, modifierWindowOpen } from '../fixtures/views'

const send = jest.fn(async () => ({ commandId: 'test', accepted: true as const }))
const board = (view: PlayerView) => <GameProvider view={view}><CommandProvider send={send}><Board /></CommandProvider></GameProvider>

beforeEach(() => { jest.useFakeTimers(); send.mockResolvedValue({ commandId: 'test', accepted: true }) })
afterEach(() => jest.useRealTimers())

test('removes only the expired challenge target while the other stays pickable', async () => {
  const heroes = midGame.parties.filter((party) => party.playerId !== midGame.playerId).flatMap((party) => party.heroes).slice(0, 2)
  expect(heroes).toHaveLength(2)
  const view: PlayerView = {
    ...midGame,
    pendingWindows: heroes.map((hero, index) => ({
      ...challengeWindowOpen.pendingWindows[0], windowId: `challenge-${index}`, cardId: hero.card.id,
    })),
  }
  const { rerender } = render(board(view))
  const index = view.hand.findIndex((card) => card.type === 'Challenge')
  fireEvent.click(screen.getByAltText(`hand card ${index + 1}`))
  const target = (name: string) => screen.getAllByAltText(name).find((img) => img.closest('.target-aura'))
  expect(target(heroes[0].card.name)).toBeDefined()
  expect(target(heroes[1].card.name)).toBeDefined()
  rerender(board({ ...view, pendingWindows: [view.pendingWindows[1]] }))
  expect(target(heroes[0].card.name)).toBeUndefined()
  expect(target(heroes[1].card.name)).toBeDefined()
  fireEvent.click(target(heroes[1].card.name)!)
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'Challenge', payload: { cardId: view.hand[index].id, targetedCardId: heroes[1].card.id } }))
})

test('a discard choice is answered from the pile: the pile glows, the eligible card glows inside it', async () => {
  const hero = midGame.parties[0].heroes[0].card
  const view: PlayerView = {
    ...midGame, acceptsActions: false,
    discardPile: [hero, ...midGame.discardPile],
    pendingWindows: [{
      windowId: 'fallen', type: 'CardChoice', respondentId: midGame.playerId,
      isYours: true, options: [hero.id], optionCards: [hero], deadline: Date.now() + 15_000,
    }],
  }
  render(board(view))
  // no picker dialog of its own: the pile is the gold target
  expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull()
  const pile = screen.getByRole('button', { name: /^Open discard pile/ })
  expect(pile.className).toContain('target-aura')
  fireEvent.click(pile)
  const dialog = await screen.findByRole('dialog', { name: 'Discard pile' })
  const cards = within(dialog).getAllByRole('article')
  const pick = within(dialog).getByRole('img', { name: `${hero.name}, ${hero.type}` }).closest('article')!
  expect(pick.className).toContain('target-aura')
  // the rest of the pile is dimmed, not pickable
  expect(cards.filter((card) => card !== pick).every((card) => !card.className.includes('target-aura'))).toBe(true)
  fireEvent.click(pick)
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'SubmitChoice', payload: { windowId: 'fallen', choice: hero.id } }))
})

test('Skip glows until our pass, then glows again after a modifier clears passes', async () => {
  const view = modifierWindowOpen
  const { rerender } = render(board(view))
  expect(screen.getByRole('button', { name: 'Skip reaction' }).querySelector('.skip-glow')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Skip reaction' }))
  expect(send).toHaveBeenCalledWith({ type: 'PassWindow', payload: { windowId: view.pendingWindows[0].windowId } })
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [view.playerId] } })) }))
  expect(screen.getByRole('button', { name: 'Waiting for the other players' })).toBeDisabled()
  expect(document.querySelector('.skip-glow')).toBeNull()
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [] } })) }))
  expect(screen.getByRole('button', { name: 'Skip reaction' }).querySelector('.skip-glow')).toBeTruthy()
})
