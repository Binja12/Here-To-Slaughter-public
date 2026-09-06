import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Board from './Board'
import { GameProvider } from '../state/game'
import { CommandProvider } from '../state/commands'
import { CommandResult, GameCommandInput, PlayerView, RefusalReason } from '../contract'
import { challengeStarted, challengeWindowOpen, midGame, modifierWindowOpen } from '../fixtures/views'
import * as audio from '../audio/AudioProvider'

const send = jest.fn<Promise<CommandResult>, [GameCommandInput]>(async () => ({ commandId: 'test', accepted: true }))
const board = (view: PlayerView) => <GameProvider view={view}><CommandProvider send={send}><Board /></CommandProvider></GameProvider>
const originalAnimate = Element.prototype.animate
const playSound = jest.fn()

beforeEach(() => {
  jest.useFakeTimers()
  playSound.mockClear()
  jest.spyOn(audio, 'useAudio').mockReturnValue({ volume: 50, playSound, setVolume: jest.fn(), setMusic: jest.fn() })
  send.mockResolvedValue({ commandId: 'test', accepted: true })
  send.mockClear()
  Element.prototype.animate = jest.fn(() => ({ cancel: jest.fn() })) as unknown as typeof Element.prototype.animate
})
afterEach(() => { jest.useRealTimers(); Element.prototype.animate = originalAnimate; jest.restoreAllMocks() })

test('discard rustle belongs to individual cards in the browser, not the pile opener', () => {
  render(board(midGame))
  const pile = screen.getByRole('button', { name: /^Open discard pile/ })
  fireEvent.pointerEnter(pile)
  fireEvent.focus(pile)
  fireEvent.click(pile)
  expect(playSound).not.toHaveBeenCalled()
  const dialog = screen.getByRole('dialog', { name: 'Discard pile' })
  const cards = within(dialog).getAllByRole('article')
  expect(cards.length).toBeGreaterThan(1)
  fireEvent.mouseEnter(cards[0])
  fireEvent.mouseMove(cards[0])
  expect(playSound).toHaveBeenCalledTimes(1)
  fireEvent.mouseLeave(cards[0])
  fireEvent.mouseEnter(cards[1])
  expect(playSound).toHaveBeenCalledTimes(2)
  fireEvent.mouseLeave(cards[1])
  fireEvent.mouseEnter(cards[0])
  expect(playSound).toHaveBeenCalledTimes(3)
  expect(playSound.mock.calls.every(([sound]) => sound === 'discardHover')).toBe(true)
})

test('window opener follows the running window and can open an unmodified roll', () => {
  const { rerender, container } = render(board(modifierWindowOpen))
  expect(screen.getByRole('slider', { name: 'Sound volume' }).closest('details')).toBeNull()
  const modifierButton = screen.getByRole('button', { name: 'Modifier window' })
  expect(modifierButton).toBeEnabled()
  expect(modifierButton.parentElement).toHaveClass('z-40')
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')
  fireEvent.click(modifierButton)
  expect(container.querySelector('.board-root')).toHaveClass('challenge-open')
  expect(modifierButton).toBeEnabled()
  fireEvent.click(modifierButton)
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')
  fireEvent.click(modifierButton)
  expect(container.querySelector('.board-root')).toHaveClass('challenge-open')
  rerender(board(challengeStarted))
  expect(screen.getByRole('button', { name: 'Challenge window' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Modifier window' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Challenge window' }))
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')
  fireEvent.click(screen.getByRole('button', { name: 'Challenge window' }))
  expect(container.querySelector('.board-root')).toHaveClass('challenge-open')
  rerender(board({ ...midGame, pendingWindows: [] }))
  expect(screen.queryByRole('button', { name: 'Modifier window' })).toBeNull()
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')
})

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
  expect(screen.getByRole('button', { name: 'Skip reaction' })).toBeDisabled()
  expect(document.querySelector('.skip-glow')).toBeNull()
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [] } })) }))
  expect(screen.getByRole('button', { name: 'Skip reaction' }).querySelector('.skip-glow')).toBeTruthy()
})

test.each(['player-a', 'player-b', 'player-c'])('Skip responds immediately for %s without a server snapshot and rearms on a modifier', async (playerId) => {
  const view = { ...modifierWindowOpen, playerId }
  let acknowledge!: (result: CommandResult) => void
  send.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve }))
  const { rerender } = render(board(view))
  const skip = () => screen.getByRole('button', { name: 'Skip reaction' })
  fireEvent.click(skip())
  expect(skip()).toBeDisabled()
  expect(skip().querySelector('.skip-glow')).toBeNull()
  fireEvent.click(skip())
  expect(send).toHaveBeenCalledTimes(1)
  await act(async () => acknowledge({ commandId: 'test', accepted: true }))
  expect(skip()).toBeDisabled()
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: ['someone-else'] } })) }))
  expect(skip()).toBeDisabled()
  const modified = { ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window,
    deadline: window.deadline + 1000,
    detail: { ...window.detail, finalRoll: 10, bonuses: [{ cardSource: 'modifier-080', amount: 2 }], passedBy: [] },
  })) }
  rerender(board(modified))
  expect(skip()).toBeEnabled()
  expect(skip().querySelector('.skip-glow')).toBeTruthy()
  await act(async () => { fireEvent.click(skip()) })
  expect(skip()).toBeDisabled()
  rerender(board({ ...view, pendingWindows: [] }))
  expect(screen.queryByRole('button', { name: 'Skip reaction' })).toBeNull()
})

test('a rejected pass lights Skip again', async () => {
  send.mockResolvedValueOnce({ commandId: 'test', accepted: false, reason: RefusalReason.WindowNotPassable })
  render(board(modifierWindowOpen))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skip reaction' })) })
  const skip = screen.getByRole('button', { name: 'Skip reaction' })
  expect(skip).toBeEnabled()
  expect(skip.querySelector('.skip-glow')).toBeTruthy()
})

test('a late acknowledgement does not suppress the reopened modifier window', async () => {
  let acknowledge!: () => void
  send.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = () => resolve({ commandId: 'test', accepted: true }) }))
  const { rerender } = render(board(modifierWindowOpen))
  fireEvent.click(screen.getByRole('button', { name: 'Skip reaction' }))
  rerender(board({ ...modifierWindowOpen, pendingWindows: modifierWindowOpen.pendingWindows.map((window) => ({ ...window, deadline: window.deadline + 1000 })) }))
  await act(async () => acknowledge())
  expect(screen.getByRole('button', { name: 'Skip reaction' })).toBeEnabled()
})

test('the asking leader stays in its slot with a pink highlight and no reaction timer', () => {
  const leader = midGame.parties[0].leader
  const view: PlayerView = { ...midGame, pendingWindows: [{
    windowId: 'leader-choice', type: 'PlayerChoice', respondentId: midGame.playerId,
    isYours: true, options: [midGame.parties[1].playerId],
    deadline: Date.now() + 20000, detail: { sourceCardId: leader.id },
  }] }
  const { rerender } = render(board(view))
  expect(screen.getAllByAltText(leader.name)).toHaveLength(1)
  expect(screen.getByAltText(leader.name).parentElement).toHaveClass('choice-source-aura', 'dim-exempt')
  expect(screen.queryByTitle('reaction clock')).toBeNull()
  rerender(board({ ...view, pendingWindows: [] }))
  expect(screen.getByAltText(leader.name).parentElement).not.toHaveClass('choice-source-aura')
})
