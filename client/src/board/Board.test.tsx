import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Board from './Board'
import { GameProvider } from '../state/game'
import { CommandProvider } from '../state/commands'
import { CommandResult, GameCommandInput, PlayerView, RefusalReason } from '../contract'
import { challengeStarted, challengeWindowOpen, midGame, modifierWindowOpen, monsterAsksOverRoll, rollTargetsYou } from '../fixtures/views'
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

/** The HUD's Skip; the modifier window carries a second one with the same label and state. */
const hudSkip = () => screen.getAllByRole('button', { name: 'Skip reaction' })[0]

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

test('every roll opens its window at once; the opener puts it away and brings it back', () => {
  const { rerender, container } = render(board(modifierWindowOpen))
  const modifierButton = screen.getByRole('button', { name: 'Modifier window' })
  expect(modifierButton).toBeEnabled()
  // open the moment the roll is made, with its own Skip on it — the HUD's steps aside
  expect(container.querySelector('.board-root')).toHaveClass('challenge-open')
  // the hand sits above the opener while the stage is up
  const handWidget = screen.getAllByAltText(/^hand card/)[0].closest('.z-40') as HTMLElement
  expect(modifierButton.closest('[class*="z-[160]"]')).not.toBeNull()
  expect(Number(handWidget.style.zIndex)).toBeGreaterThan(160)
  expect(screen.getAllByRole('button', { name: 'Skip reaction' })).toHaveLength(1)
  fireEvent.click(modifierButton)
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')
  expect(screen.getAllByRole('button', { name: 'Skip reaction' })).toHaveLength(1)
  expect(modifierButton.closest('[class*="z-[110]"]')).not.toBeNull()
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
  // With nothing running the slot STAYS, greyed: it used to unmount, so the
  // painted plaque blinked in and out of the rim (the owner, 2026-09-07).
  rerender(board({ ...midGame, pendingWindows: [] }))
  expect(screen.getByRole('button', { name: 'Modifier window' })).toBeDisabled()
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')
})

test('the volume lives behind the gear, not on the felt', () => {
  render(board(midGame))
  expect(screen.queryByRole('slider', { name: 'Sound volume' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  expect(screen.getByRole('slider', { name: 'Sound volume' })).toBeInTheDocument()
})

test("pressing a challenge card contests the open play at once — the target is the table's, nothing is aimed", async () => {
  const hero = midGame.parties.filter((party) => party.playerId !== midGame.playerId).flatMap((party) => party.heroes)[0]
  const view: PlayerView = {
    ...midGame,
    pendingWindows: [{ ...challengeWindowOpen.pendingWindows[0], windowId: 'challenge-0', cardId: hero.card.id }],
  }
  const { container } = render(board(view))
  const index = view.hand.findIndex((card) => card.type === 'Challenge')
  fireEvent.click(screen.getByAltText(`hand card ${index + 1}`))
  expect(container.querySelector('.target-aura')).toBeNull()
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'Challenge', payload: { cardId: view.hand[index].id } }))
})

test('a discard choice is answered from the pile: the pile glows, the eligible card glows inside it', async () => {
  const hero = midGame.parties[0].heroes[0].card
  const view: PlayerView = {
    ...midGame,
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
  expect(hudSkip().querySelector('.skip-glow')).toBeTruthy()
  fireEvent.click(hudSkip())
  expect(send).toHaveBeenCalledWith({ type: 'PassWindow', payload: { windowId: view.pendingWindows[0].windowId } })
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [view.playerId] } })) }))
  expect(hudSkip()).toBeDisabled()
  expect(document.querySelector('.skip-glow')).toBeNull()
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [] } })) }))
  expect(hudSkip().querySelector('.skip-glow')).toBeTruthy()
})

test.each(['player-a', 'player-b', 'player-c'])('Skip responds immediately for %s without a server snapshot and rearms on a modifier', async (playerId) => {
  const view = { ...modifierWindowOpen, playerId }
  let acknowledge!: (result: CommandResult) => void
  send.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve }))
  const { rerender } = render(board(view))
  const skip = () => hudSkip()
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
  expect(screen.queryAllByRole('button', { name: 'Skip reaction' })).toHaveLength(0)
})

test('a rejected pass lights Skip again', async () => {
  send.mockResolvedValueOnce({ commandId: 'test', accepted: false, reason: RefusalReason.WindowNotPassable })
  render(board(modifierWindowOpen))
  await act(async () => { fireEvent.click(hudSkip()) })
  const skip = hudSkip()
  expect(skip).toBeEnabled()
  expect(skip.querySelector('.skip-glow')).toBeTruthy()
})

test('a late acknowledgement does not suppress the reopened modifier window', async () => {
  let acknowledge!: () => void
  send.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = () => resolve({ commandId: 'test', accepted: true }) }))
  const { rerender } = render(board(modifierWindowOpen))
  fireEvent.click(hudSkip())
  rerender(board({ ...modifierWindowOpen, pendingWindows: modifierWindowOpen.pendingWindows.map((window) => ({ ...window, deadline: window.deadline + 1000 })) }))
  await act(async () => acknowledge())
  expect(hudSkip()).toBeEnabled()
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

test("a roll's chosen target reddens the WIDGET the effect reaches — the hand frame, or the party frame — never the cards", () => {
  const [rolling] = modifierWindowOpen.pendingWindows
  const other = modifierWindowOpen.seats.find((seat) => seat.playerId !== modifierWindowOpen.playerId)!
  const aimedAt = (targetZone: string): PlayerView => ({
    ...modifierWindowOpen,
    pendingWindows: [{ ...rolling, detail: { ...rolling.detail, targetPlayerId: other.playerId, targetZone } }],
  })
  // the widget FRAMES only: the contested monster and the total's scroll wear the red for their own reasons
  const redFrames = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('img.enemy-aura')).filter((img) => (img.getAttribute('src') ?? '').includes('Frame'))

  const { container, rerender } = render(board(aimedAt('Hand')))
  const handFrames = redFrames(container)
  expect(handFrames).toHaveLength(1)
  expect(handFrames[0].tagName).toBe('IMG')
  expect(handFrames[0].getAttribute('alt')).toBe('')
  expect(screen.getAllByAltText('card back').every((img) => !img.parentElement?.classList.contains('enemy-aura'))).toBe(true)

  rerender(board(aimedAt('Party')))
  const partyFrames = redFrames(container)
  expect(partyFrames).toHaveLength(1)
  expect(partyFrames[0]).not.toBe(handFrames[0])
  const theirParty = modifierWindowOpen.parties.find((party) => party.playerId === other.playerId)!
  for (const hero of theirParty.heroes) {
    expect(screen.getAllByAltText(hero.card.name).every((img) => !img.classList.contains('enemy-aura'))).toBe(true)
  }
})

test("my own question over the roll comes first: the window waits for the answer, and the opener can still bring it forward", () => {
  const [rolling] = modifierWindowOpen.pendingWindows
  const asked: PlayerView = {
    ...modifierWindowOpen,
    pendingWindows: [
      rolling,
      { windowId: 'target', type: 'PlayerChoice', respondentId: modifierWindowOpen.playerId, options: ['player-b'], deadline: Date.now() + 30_000, isYours: true },
    ],
  }
  const { container, rerender } = render(board(asked))
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')

  const opener = screen.getByRole('button', { name: 'Modifier window' })
  fireEvent.click(opener)
  expect(container.querySelector('.board-root')).toHaveClass('challenge-open')
  fireEvent.click(opener)
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')

  rerender(board(modifierWindowOpen))
  expect(container.querySelector('.board-root')).toHaveClass('challenge-open')
})

test("a monster's \"you may\" takes the stage over the roll it is watching", () => {
  const { container } = render(board(monsterAsksOverRoll))

  // The ask comes first — the roll's own window steps aside for it — and it
  // is drawn ABOVE where that window sits (z-140), so bringing the window
  // back with its opener cannot bury the question the way the strip card was.
  const draw = screen.getByRole('button', { name: /crowned serpent draws/i })
  const ask = draw.closest('[class*="z-[210]"]')
  expect(ask).not.toBeNull()
  // no strip card as well
  expect(screen.queryByText('Your response, You')).toBeNull()
  expect(within(ask as HTMLElement).getByAltText('Crowned Serpent')).toBeInTheDocument()
  const forfeit = within(ask as HTMLElement).getByRole('button', { name: 'No' })

  fireEvent.click(draw)
  expect(send).toHaveBeenCalledWith({
    type: 'SubmitChoice',
    payload: { windowId: 'window-serpent', choice: 'confirm' },
  })

  send.mockClear()
  fireEvent.click(forfeit)
  expect(send).toHaveBeenCalledWith({
    type: 'SubmitChoice',
    payload: { windowId: 'window-serpent', choice: 'dismiss' },
  })
})

test('the screen bleeds red while an opponent\'s roll is aimed at you, and nowhere else', () => {
  const { container, rerender } = render(board(rollTargetsYou))
  expect(container.querySelector('.target-vignette')).not.toBeNull()

  rerender(board(modifierWindowOpen))
  expect(container.querySelector('.target-vignette')).toBeNull()
})

test('the glow setting turns every aura off without touching the overlay dim', () => {
  const { container } = render(board(midGame))
  const root = container.querySelector('.board-root')!
  expect(root).not.toHaveClass('no-glow')

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /glow effects/i }))
  expect(root).toHaveClass('no-glow')
})

test('every card the server calls a passive wears the pink aura, all game long', () => {
  const { container } = render(board(midGame))
  const pink = Array.from(container.querySelectorAll('.passive-aura'))
  expect(pink.length).toBeGreaterThan(0)
  // the two leaders the fixture names, and no window is open to make them
  // "relevant" — pink is now about the card, not the moment
  expect(midGame.pendingWindows).toHaveLength(0)
  // An opponent's passive leader (the aura rides the leader's wrapper). The
  // viewer's own is GREEN instead — pink stays the lowest of the four tones,
  // so "you may roll on this" still wins the card it is on.
  expect(screen.getByAltText('The Fist of Reason').closest('.passive-aura')).not.toBeNull()
  expect(screen.getByAltText('The Divine Arrow').closest('.card-aura')).not.toBeNull()
})
