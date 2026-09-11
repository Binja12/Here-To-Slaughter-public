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
/** Skip is not on screen at all — there is nothing left for it to give up. */
const noSkip = () => screen.queryAllByRole('button', { name: 'Skip reaction' }).length === 0

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

// The owner, 2026-09-08: a Skip with nothing behind it reads as an action the
// table is waiting on, so the button is absent — not merely disabled — once
// this seat has no window left to give up.
test('Skip glows until our pass, goes away, and comes back when a modifier clears passes', async () => {
  const view = modifierWindowOpen
  const { rerender } = render(board(view))
  expect(hudSkip().querySelector('.skip-glow')).toBeTruthy()
  fireEvent.click(hudSkip())
  expect(send).toHaveBeenCalledWith({ type: 'PassWindow', payload: { windowId: view.pendingWindows[0].windowId } })
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [view.playerId] } })) }))
  expect(noSkip()).toBe(true)
  expect(document.querySelector('.skip-glow')).toBeNull()
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: [] } })) }))
  expect(hudSkip().querySelector('.skip-glow')).toBeTruthy()
})

test.each(['player-a', 'player-b', 'player-c'])('Skip responds immediately for %s without a server snapshot and rearms on a modifier', async (playerId) => {
  const view = { ...modifierWindowOpen, playerId }
  let acknowledge!: (result: CommandResult) => void
  send.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve }))
  const { rerender } = render(board(view))
  fireEvent.click(hudSkip())
  // gone at once, on the local pass alone — no server snapshot yet, and so
  // no second press to send
  expect(noSkip()).toBe(true)
  expect(send).toHaveBeenCalledTimes(1)
  await act(async () => acknowledge({ commandId: 'test', accepted: true }))
  expect(noSkip()).toBe(true)
  rerender(board({ ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window, detail: { ...window.detail, passedBy: ['someone-else'] } })) }))
  expect(noSkip()).toBe(true)
  const modified = { ...view, pendingWindows: view.pendingWindows.map((window) => ({ ...window,
    deadline: window.deadline + 1000,
    detail: { ...window.detail, finalRoll: 10, bonuses: [{ cardSource: 'modifier-080', amount: 2 }], passedBy: [] },
  })) }
  rerender(board(modified))
  expect(hudSkip()).toBeEnabled()
  expect(hudSkip().querySelector('.skip-glow')).toBeTruthy()
  await act(async () => { fireEvent.click(hudSkip()) })
  expect(noSkip()).toBe(true)
  rerender(board({ ...view, pendingWindows: [] }))
  expect(noSkip()).toBe(true)
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

test("a roll aimed at you is said by the SCREEN's rim and nowhere else — no reddened widget frames", () => {
  const [rolling] = modifierWindowOpen.pendingWindows
  const aimedAtMe = (targetZone: string): PlayerView => ({
    ...modifierWindowOpen,
    pendingWindows: [{
      ...rolling,
      detail: {
        ...rolling.detail,
        targets: [{ playerId: modifierWindowOpen.playerId, zone: targetZone }],
      },
    }],
  })
  const redFrames = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('img.enemy-aura')).filter((img) => (img.getAttribute('src') ?? '').includes('Frame'))

  const { container, rerender } = render(board(aimedAtMe('Hand')))
  expect(container.querySelector('.target-vignette')).not.toBeNull()
  expect(redFrames(container)).toHaveLength(0)

  rerender(board(aimedAtMe('Party')))
  expect(container.querySelector('.target-vignette')).not.toBeNull()
  expect(redFrames(container)).toHaveLength(0)
})

test('the screen rim is YOUR turn, and another seat lights its own frames', () => {
  const [rolling] = modifierWindowOpen.pendingWindows
  const myTurn: PlayerView = { ...midGame, currentPlayerId: midGame.playerId }
  const { container, rerender } = render(board(myTurn))
  expect(container.querySelector('.turn-vignette.turn-side-all')).not.toBeNull()
  expect(container.querySelector('.target-vignette')).toBeNull()
  // my own frames never wear it: the rim is already saying it
  expect(container.querySelectorAll('.turn-frame-aura')).toHaveLength(0)

  // An opponent's turn takes the rim off the screen entirely and lights
  // that seat instead — leader frame, hero frame and card stack.
  rerender(board({ ...midGame, currentPlayerId: midGame.seats[1].playerId }))
  expect(container.querySelector('.turn-vignette')).toBeNull()
  expect(container.querySelectorAll('.turn-frame-aura')).toHaveLength(3)
  rerender(board({ ...midGame, currentPlayerId: midGame.seats[2].playerId }))
  expect(container.querySelectorAll('.turn-frame-aura')).toHaveLength(3)

  // my turn AND a roll aimed at me: the red rim rides over the green one
  rerender(board({
    ...myTurn,
    pendingWindows: [{
      ...rolling,
      detail: { ...rolling.detail, targets: [{ playerId: midGame.playerId, zone: 'Party' }] },
    }],
  }))
  expect(container.querySelector('.target-vignette')).not.toBeNull()
  expect(container.querySelector('.turn-vignette')).not.toBeNull()
})

test('a reaction window narrows the hand to the cards that answer it, and opens it', () => {
  const { container, rerender } = render(board(midGame))
  const shown = () => screen.queryAllByAltText(/^hand card/).length
  expect(shown()).toBe(midGame.hand.length)

  // a roll on the table: only the modifiers, and the fan is held open
  rerender(board(modifierWindowOpen))
  const modifiers = modifierWindowOpen.hand.filter((card) => card.type === 'Modifier').length
  expect(modifiers).toBeGreaterThan(0)
  expect(shown()).toBe(modifiers)
  const fan = container.querySelector('.hand-group > div:nth-child(2)')!
  expect(fan.className).toContain('opacity-100')

  // a play that can still be contested: only the challenges
  const contestable: PlayerView = {
    ...midGame,
    busy: true,
    pendingWindows: [{ ...challengeWindowOpen.pendingWindows[0], windowId: 'c1', cardId: midGame.parties[1].heroes[0].card.id }],
  }
  rerender(board(contestable))
  const challenges = midGame.hand.filter((card) => card.type === 'Challenge').length
  expect(challenges).toBeGreaterThan(0)
  expect(shown()).toBe(challenges)
})

test('every choice this seat is asked puts its instruction up in large type, takes no clicks, and goes with its window', () => {
  const asked: PlayerView = {
    ...midGame,
    busy: true,
    pendingWindows: [{
      windowId: 'sacrifice',
      type: 'CardChoice',
      respondentId: midGame.playerId,
      isYours: true,
      options: [midGame.parties[0].heroes[0].card.id],
      detail: { question: 'Choose a hero to sacrifice', sourceCardId: midGame.parties[0].monsters[0].id },
      deadline: Date.now() + 15_000,
    }],
  }
  const { container, rerender } = render(board(asked))
  const banner = screen.getByText('Choose a hero to sacrifice')
  expect(banner.closest('.pointer-events-none')).not.toBeNull()

  // a window whose task was never given one still says something useful
  rerender(board({
    ...asked,
    pendingWindows: [{ ...asked.pendingWindows[0], detail: { sourceCardId: 'x' } }],
  }))
  expect(screen.getByText('Choose a card')).toBeInTheDocument()

  // …and a roll is the table's business, not a question put to this seat.
  // The words go the moment the question does: an answer is a press, and
  // the banner must not sit over the board after it (the owner, 2026-09-08).
  rerender(board(modifierWindowOpen))
  expect(container.querySelector('.choice-banner')).toBeNull()
})

// The owner, 2026-09-08: a question of this seat's own is a GATE, not a
// preference. The roll's window does not open over it — not on its own, and
// not by pressing the opener — and nothing asks a second question on top of
// the one already waiting.
test('my own question over the roll comes first: nothing opens over it until it is answered', () => {
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
  expect(screen.queryByText('Do you want to modify?')).toBeNull()

  const opener = screen.getByRole('button', { name: 'Modifier window' })
  fireEvent.click(opener)
  expect(container.querySelector('.board-root')).not.toHaveClass('challenge-open')

  // answered: the roll takes the stage, and asks its own question again
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

test('each aura tone has its own switch, and one going off leaves the others alone', () => {
  const { container } = render(board(midGame))
  const root = container.querySelector('.board-root')!
  for (const tone of ['no-aura-play', 'no-aura-effect', 'no-aura-target', 'no-aura-instant']) {
    expect(root).not.toHaveClass(tone)
  }

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /effects aura/i }))
  expect(root).toHaveClass('no-aura-effect')
  expect(root).not.toHaveClass('no-aura-play')
  expect(root).not.toHaveClass('no-aura-target')
  expect(root).not.toHaveClass('no-aura-instant')

  fireEvent.click(screen.getByRole('checkbox', { name: /target aura/i }))
  expect(root).toHaveClass('no-aura-effect')
  expect(root).toHaveClass('no-aura-target')
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

// Lazy Choice answers for the player, so the way OUT of it is behaviour worth
// pinning: shift on the action that STARTS a sequence hands that whole
// exchange back, and it stays handed back until the table is quiet again.
describe('Lazy Choice, and taking a sequence back from it', () => {
  /** my own roll, already past its mark and still passable — a lazy skip */
  const clearing: PlayerView = {
    ...modifierWindowOpen,
    pendingWindows: modifierWindowOpen.pendingWindows.map((window) => ({
      ...window,
      detail: {
        ...window.detail,
        rollerId: modifierWindowOpen.playerId,
        finalRoll: 12,
        rollReq: 9,
        passedBy: [],
      },
    })),
  }
  const passed = () =>
    send.mock.calls.some(([command]) => command.type === 'PassWindow')

  beforeEach(() => {
    localStorage.setItem('htsr.boardSettings', JSON.stringify({ lazyChoice: true }))
  })
  afterEach(() => localStorage.removeItem('htsr.boardSettings'))

  it('skips a settled roll of mine on its own, after the delay that hides my hand', () => {
    render(board(clearing))
    // nothing yet: an instant pass would announce that I hold no modifier
    expect(passed()).toBe(false)
    act(() => { jest.advanceTimersByTime(30_000) })
    expect(passed()).toBe(true)
  })

  // A window put up and taken down again in the same beat is a FLASH. The
  // board decides the lazy answer during the render that would draw the
  // window, so the window is never drawn at all (the owner, 2026-09-08: the
  // Protecting Horn's value blinked open over a +1/-3).
  it('never draws a window it is about to answer', () => {
    const valueOpen: PlayerView = {
      ...midGame,
      busy: true,
      pendingWindows: [
        {
          windowId: 'value',
          type: 'ValueChoice',
          respondentId: midGame.playerId,
          options: [1, -3],
          detail: { bias: 'highest', sourceCardId: midGame.hand[0].id },
          deadline: Date.now() + 30_000,
          isYours: true,
        },
      ],
    }
    const { unmount } = render(board(valueOpen))
    expect(screen.queryByText(/choose value/i)).toBeNull()
    unmount()

    // and it IS the lazy answer doing that: switched off, the window shows
    localStorage.removeItem('htsr.boardSettings')
    render(board(valueOpen))
    expect(screen.getByText(/choose value/i)).toBeInTheDocument()
  })

  it('answers nothing once an action was pressed with SHIFT', () => {
    const { rerender } = render(board(midGame))
    const leader = screen.getByAltText(midGame.parties[0].leader.name)
    fireEvent.mouseDown(leader, { shiftKey: true })
    fireEvent.click(leader)
    send.mockClear()

    rerender(board(clearing))
    act(() => { jest.advanceTimersByTime(30_000) })
    expect(passed()).toBe(false)
  })
})

// Bloodwing asks the CHALLENGER to discard, so the question arrives while the
// challenge is on stage. The fan narrows to the cards that answer a reaction
// window — and that hid every card the discard was offering, leaving a
// question with no answers on screen (the owner, 2026-09-08).
test('a discard asked during a challenge shows the cards it offers, not the reaction filter', () => {
  const [contest] = challengeWindowOpen.pendingWindows
  // no challenge cards in hand: the fan would otherwise narrow to nothing
  const hand = midGame.hand.filter((card) => card.type !== 'Challenge')
  const offered = hand.slice(0, 2).map((card) => card.id)
  const asked: PlayerView = {
    ...midGame,
    hand,
    busy: true,
    pendingWindows: [
      contest,
      {
        windowId: 'bloodwing-discard',
        type: 'CardChoice',
        respondentId: midGame.playerId,
        options: offered,
        detail: { question: 'Choose a card to discard' },
        deadline: Date.now() + 30_000,
        isYours: true,
      },
    ],
  }

  render(board(asked))
  // the fan draws one img per SHOWN card; the two offered are there
  const shown = screen.getAllByAltText(/^hand card /)
  expect(shown).toHaveLength(offered.length)
})

// "Steal it instead of destroying it?" is about a particular hero, and the
// answer means nothing without knowing which (the owner, 2026-09-08).
test('a choice of action shows the card asking AND the card it is about', () => {
  const sabretooth = midGame.parties[0].monsters[0]
  const victim = midGame.parties[0].heroes[0].card
  const asked: PlayerView = {
    ...midGame,
    busy: true,
    pendingWindows: [
      {
        windowId: 'steal-or-destroy',
        type: 'TaskChoice',
        respondentId: midGame.playerId,
        options: ['Steal it instead', 'Destroy it'],
        detail: {
          question: 'Steal it instead of destroying it?',
          sourceCardId: sabretooth.id,
          cardId: victim.id,
        },
        deadline: Date.now() + 30_000,
        isYours: true,
      },
    ],
  }

  render(board(asked))
  // both cards, and the question itself, inside the overlay that offers the
  // two answers
  expect(screen.getByRole('button', { name: 'Steal it instead' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Destroy it' })).toBeInTheDocument()
  expect(screen.getAllByAltText(sabretooth.name).length).toBeGreaterThan(0)
  expect(screen.getAllByAltText(victim.name).length).toBeGreaterThan(0)
  expect(
    screen.getAllByText('Steal it instead of destroying it?').length,
  ).toBeGreaterThan(0)
})

// A pick off the pile was asked over a board that did not show the pile, and
// the centre banner ghosted through its translucent backdrop (the owner,
// 2026-09-08).
test('a choice off the discard pile opens the pile, and the banner stands down', () => {
  // a pile card that is NOT also in hand: the fixture reuses card objects,
  // and targetKeyForId resolves a hand match first
  const top = midGame.discardPile.find(
    (card) => !midGame.hand.some((held) => held.id === card.id),
  )!
  const asked: PlayerView = {
    ...midGame,
    busy: true,
    pendingWindows: [
      {
        windowId: 'call-of-the-fallen',
        type: 'CardChoice',
        respondentId: midGame.playerId,
        options: [top.id],
        detail: { question: 'Choose a card to take' },
        deadline: Date.now() + 30_000,
        isYours: true,
      },
    ],
  }

  render(board(asked))
  expect(screen.getByRole('dialog', { name: 'Discard pile' })).toBeInTheDocument()
  // the question is in the pile, and NOT also on the centre banner behind it
  expect(screen.getByText('Choose a card to take')).toBeInTheDocument()
  expect(document.querySelector('.choice-banner')).toBeNull()
})
