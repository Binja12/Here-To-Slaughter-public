import { Audience, GameEventType } from 'shared'
import { CommandDispatcherService } from '../../game-server/command-dispatcher.service'
import { GameEvent } from '../events/game-event'
import { GameEventFactory } from '../events/game-event-factory'
import {
  Table,
  active,
  settle,
  stacked,
} from '../setup/play-through-helpers'
import { GameLog, logLine } from './game-log'

// ---------------------------------------------------------------------------
// The story projection, on a real dealt table driven through the real
// dispatcher: what each seat reads, what developers get, and that a line
// names a card only to the seats that saw it.
// ---------------------------------------------------------------------------

const ALICE = 'alice'
const BOB = 'bob'
const UUID = '11111111-1111-4111-8111-111111111111'

describe('GameLog', () => {
  let t: Table
  let log: GameLog
  let dispatcher: CommandDispatcherService

  beforeEach(() => {
    // Alice holds hero-001 (Bad Axe) and modifier-080; Bob hero-002 and modifier-081.
    t = stacked({
      seats: [ALICE, BOB],
      handSize: 2,
      deck: ['hero-001', 'modifier-080', 'hero-002', 'modifier-081'],
    })
    expect(active(t)).toBe(ALICE)
    log = new GameLog(t.game.gameState)
    t.game.emitter.addListener(log)
    dispatcher = new CommandDispatcherService()
  })

  afterEach(async () => {
    await settle(t)
  })

  const command = (type: string, payload: unknown = {}) => ({
    commandId: UUID,
    type,
    payload,
  })

  it('tells of a play by the seat and the card, the same to everyone', () => {
    dispatcher.dispatch(t.game, ALICE, command('PlayHero', { cardId: 'hero-001' }))

    const alice = log.entriesFor(ALICE)
    const bob = log.entriesFor(BOB)
    expect(alice.map((e) => e.text)).toContain('alice played Bad Axe')
    expect(alice).toEqual(bob)
    expect(alice.map((e) => e.seq)).toEqual(alice.map((_, i) => i + 1))
    expect(alice.every((e) => typeof e.at === 'number')).toBe(true)
  })

  it('names a drawn card to the drawer alone; the table reads "drew a card"', () => {
    dispatcher.dispatch(t.game, ALICE, command('DrawCard'))

    const mine = log.entriesFor(ALICE).at(-1)!
    const theirs = log.entriesFor(BOB).at(-1)!
    expect(mine.seq).toBe(theirs.seq)
    expect(mine.playerId).toBe(ALICE)
    expect(theirs.text).toBe('alice drew a card')
    expect(mine.text).toMatch(/^alice drew (?!a card$)/)
  })

  it('records every engine event verbatim for developers, the bookkeeping included', () => {
    dispatcher.dispatch(t.game, ALICE, command('DrawCard'))
    dispatcher.dispatch(t.game, ALICE, command('PlayHero', { cardId: 'hero-001' }))

    const { events, lines } = log.drain()
    const drawn = events.find((e) => e.type === GameEventType.CardDrawn)!
    expect(drawn).toMatchObject({ seq: 1, playerId: ALICE, audience: Audience.PlayerOnly })
    expect((drawn.payload as { cardId: string }).cardId).toMatch(/^hero-/)
    expect(events.map((e) => e.type)).toEqual([
      GameEventType.CardDrawn,
      GameEventType.CardRemovedFromHand,
      GameEventType.HeroAddedToParty,
      GameEventType.ReactionWindowOpened,
    ])
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4])
    // The lines are the player's story; the engine's hand and window
    // bookkeeping is not.
    expect(lines.map((l) => l.line.text)).toEqual(['alice drew a card', 'alice played Bad Axe'])
  })

  it('drains only what came since the last drain', () => {
    dispatcher.dispatch(t.game, ALICE, command('DrawCard'))
    const first = log.drain()
    expect(first.events).toHaveLength(1)
    expect(log.drain()).toEqual({ events: [], lines: [] })

    dispatcher.dispatch(t.game, ALICE, command('DrawCard'))

    const second = log.drain()
    expect(second.events.map((e) => e.seq)).toEqual([2])
    expect(log.entriesFor(ALICE)).toHaveLength(2)
  })

  describe('logLine', () => {
    const gs = () => t.game.gameState

    it('words the table events and the plays', () => {
      expect(logLine(gs(), new GameEvent(GameEventType.GameStarted, '', {}))).toEqual({
        text: 'The game begins',
      })
      expect(
        logLine(gs(), new GameEvent(GameEventType.GameEnded, BOB, { winnerId: BOB })),
      ).toEqual({ text: 'bob wins the game' })
      expect(logLine(gs(), GameEventFactory.heroAddedToParty(BOB, 'hero-002', 'Played'))).toEqual(
        { text: 'bob played Fury Knuckle' },
      )
      expect(logLine(gs(), GameEventFactory.heroAddedToParty(BOB, 'hero-002', 'Stolen'))).toBeUndefined()
      expect(logLine(gs(), GameEventFactory.heroStolen(BOB, ALICE, 'hero-001'))).toEqual({
        text: 'bob stole Bad Axe from alice',
      })
      expect(
        logLine(gs(), GameEventFactory.modifierPlayed(BOB, 'modifier-081', ALICE, -2)),
      ).toEqual({ text: "bob played Modifier (-2) on alice's roll" })
      expect(logLine(gs(), GameEventFactory.diceRolled(ALICE, 'hero-001', 5))).toEqual({
        text: 'alice rolled a 5 for Bad Axe',
      })
    })

    it('shows a pulled card to both hands and hides it from the rest', () => {
      expect(logLine(gs(), GameEventFactory.cardPulled(BOB, ALICE, 'hero-001'))).toEqual({
        text: "bob took a card from alice's hand",
        seen: { by: [BOB, ALICE], text: "bob took Bad Axe from alice's hand" },
      })
    })

    it('has nothing to say about the engine\'s bookkeeping', () => {
      expect(logLine(gs(), GameEventFactory.frameResolved('f', []))).toBeUndefined()
      expect(logLine(gs(), GameEventFactory.cardRemovedFromHand(ALICE, 'hero-001'))).toBeUndefined()
      expect(logLine(gs(), GameEventFactory.abilityDone(ALICE, 'hero-001'))).toBeUndefined()
    })
  })
})
