import { GameEventType, ReactionWindowType } from 'shared'
import { defaultGameConfig } from '../config/game-config'
import { CONFIRM } from '../reactions/task-choice-window'
import { createGame } from './create-game'
import {
  COUNTDOWN_MS,
  HIGHEST,
  SEATS,
  active,
  answer,
  board,
  config,
  fixDice,
  ofType,
  partyOf,
  playHero,
  see,
  settle,
  stacked,
  started,
  until,
  windowFor,
} from './play-through-helpers'

// ---------------------------------------------------------------------------
// The turn clock on a real dealt table: `TimeControl.turnTimeMs` is the one
// number the lobby's turn timer becomes, and a lapsed clock plays out like a
// pass — every open window settles on its silence, then the turn ends.
// Real clock, like every setup spec: the turn's own clock and the windows'
// clocks race, and fake timers would have to guess the order.
// ---------------------------------------------------------------------------

const clocked = (turnTimeMs: number) =>
  started(
    createGame(SEATS, {
      config: config({
        timeControl: { ...defaultGameConfig.timeControl, turnTimeMs },
      }),
    }),
  )

describe('the turn clock', () => {
  it('ends an idle turn when it lapses, forfeiting the budget like a pass', async () => {
    const t = clocked(60)
    const first = active(t)
    expect(see(t, first).seats.find((s) => s.playerId === first)!.actionPoints).toBe(3)

    await until(() => active(t) !== first, 'the clocked turn to end')

    expect(ofType(t, GameEventType.TurnEnded)).toHaveLength(1)
    // The next turn runs on its own clock: it ends too, without any play.
    const second = active(t)
    await until(() => active(t) !== second, 'the second clocked turn to end')
    expect(ofType(t, GameEventType.TurnEnded)).toHaveLength(2)
  })

  it('pauses while a window is open: the turn outlives the window, then lapses', async () => {
    // The turn's clock is SHORTER than a window's: the challenge window a
    // hero play opens stands for COUNTDOWN_MS, and the turn waits for it.
    const turnTimeMs = Math.round(COUNTDOWN_MS / 3)
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
      turnTimeMs,
    })
    const player = active(t)

    expect(playHero(t, player, 'hero-001')).toEqual({ accepted: true })
    const window = board(t).pendingWindows[0]
    expect(window).toBeDefined()

    // Twice the turn's clock later the window still stands and so does the turn.
    await new Promise((done) => setTimeout(done, turnTimeMs * 2))
    expect(active(t)).toBe(player)
    expect(board(t).pendingWindows[0]?.windowId).toBe(window.windowId)

    await until(() => active(t) !== player, 'the turn to end once its clock resumes')
    const endedAt = Date.now()

    // The window lapsed on its own silence first: uncontested, hero in play.
    expect(partyOf(board(t), player).heroes.map((h) => h.card.id)).toContain('hero-001')
    expect(board(t).busy).toBe(false)
    expect(endedAt).toBeGreaterThanOrEqual(window.deadline)
  })

  it('runs again after a roll settles with nothing offered after it, and the turn lapses', async () => {
    // A hero's own roll opens a Modifier window and nothing follows it —
    // unlike a play, which is followed by the roll it is offered. The clock
    // has to come back on the frame SETTLING, not on some later window.
    const turnTimeMs = COUNTDOWN_MS * 2
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
      turnTimeMs,
    })
    const player = active(t)

    playHero(t, player, 'hero-001')
    const offer = await windowFor(t, player, ReactionWindowType.TaskChoice)
    fixDice(HIGHEST)
    answer(t, offer, CONFIRM)
    await settle(t)
    // Two points left, so only the clock can end this turn.
    expect(active(t)).toBe(player)
    expect(see(t, player).seats.find((s) => s.playerId === player)!.actionPoints).toBe(2)

    await until(() => active(t) !== player, 'the turn to lapse once the roll has settled', turnTimeMs * 3)
    expect(ofType(t, GameEventType.TurnEnded)).toHaveLength(1)
  })

  it('has no clock when the config names none', async () => {
    const t = started(createGame(SEATS, { config: config() }))
    const first = active(t)

    await new Promise((done) => setTimeout(done, COUNTDOWN_MS * 2))

    expect(active(t)).toBe(first)
    expect(ofType(t, GameEventType.TurnEnded)).toHaveLength(0)
  })
})
