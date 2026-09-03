import { Logger } from '@nestjs/common'
import { CardType, INTERNAL_ERROR, RefusalReason } from 'shared'
import type { CommandResult, PlayerView } from 'shared'
import {
  Table,
  active,
  see,
  settle,
  stacked,
} from '../game/setup/play-through-helpers'
import { CommandDispatcherService } from './command-dispatcher.service'

// ---------------------------------------------------------------------------
// The wire meets the engine. A real dealt table with known hands, and every
// command goes through the dispatcher the way the gateway will send it. The
// board is read through `playerView` only.
// ---------------------------------------------------------------------------

const ALICE = 'alice'
const BOB = 'bob'
const UUID = '11111111-1111-4111-8111-111111111111'

/** Alice holds hero-001 and modifier-080; Bob holds hero-002 and modifier-081. */
const deal = () =>
  stacked({
    seats: [ALICE, BOB],
    handSize: 2,
    deck: ['hero-001', 'modifier-080', 'hero-002', 'modifier-081'],
  })

const command = (type: string, payload: unknown = {}, commandId = UUID) => ({
  commandId,
  type,
  payload,
})

describe('CommandDispatcherService', () => {
  let dispatcher: CommandDispatcherService
  let t: Table

  beforeAll(() => {
    // The dispatcher logs what it hides from the client; keep the test output quiet.
    Logger.overrideLogger(false)
  })

  beforeEach(() => {
    dispatcher = new CommandDispatcherService()
    t = deal()
    expect(active(t)).toBe(ALICE)
  })

  afterEach(async () => {
    await settle(t)
  })

  const send = (accountId: string, raw: unknown): CommandResult =>
    dispatcher.dispatch(t.game, accountId, raw)

  describe('accepted commands reach their door', () => {
    it('an action: DrawCard grows the active hand by one', () => {
      const before = see(t, ALICE).hand.length

      const result = send(ALICE, command('DrawCard'))

      expect(result).toEqual({ commandId: UUID, accepted: true })
      expect(see(t, ALICE).hand).toHaveLength(before + 1)
    })

    it('an action with a target: PlayHero takes the card out of hand and opens a challenge', () => {
      const result = send(ALICE, command('PlayHero', { cardId: 'hero-001' }))

      expect(result).toEqual({ commandId: UUID, accepted: true })
      const view = see(t, ALICE)
      expect(view.hand.map((c) => c.id)).not.toContain('hero-001')
      expect(view.pendingWindows.map((w) => w.type)).toContain('Challenge')
    })

    it('a pass: EndTurn hands the turn to the next seat', async () => {
      const result = send(ALICE, command('EndTurn'))

      expect(result).toEqual({ commandId: UUID, accepted: true })
      await settle(t)
      expect(active(t)).toBe(BOB)
    })
  })

  describe("the engine's refusals come back by name, with the command id", () => {
    it('NotYourTurn from the queue', () => {
      expect(send(BOB, command('EndTurn'))).toEqual({
        commandId: UUID,
        accepted: false,
        reason: RefusalReason.NotYourTurn,
      })
    })

    it("CardNotInHand from the action's own canExecute", () => {
      expect(send(ALICE, command('PlayHero', { cardId: 'hero-002' }))).toEqual({
        commandId: UUID,
        accepted: false,
        reason: RefusalReason.CardNotInHand,
      })
    })

    it('NoModifiableWindow from the board, through a reaction', () => {
      expect(
        send(
          BOB,
          command('ApplyModifier', {
            cardId: 'modifier-081',
            targetPlayerId: ALICE,
            value: 2,
          }),
        ),
      ).toEqual({
        commandId: UUID,
        accepted: false,
        reason: RefusalReason.NoModifiableWindow,
      })
    })

    it('NoSuchWindow from the choice route', () => {
      expect(
        send(
          ALICE,
          command('SubmitChoice', { windowId: 'no-such-window', choice: 'x' }),
        ),
      ).toEqual({
        commandId: UUID,
        accepted: false,
        reason: RefusalReason.NoSuchWindow,
      })
    })
  })

  describe('what the client never gets to see', () => {
    const snapshot = (): PlayerView => see(t, ALICE)

    it('a payload that fails the schema is InternalError, and the engine is not touched', () => {
      const before = snapshot()

      const result = send(ALICE, command('PlayHero', {}))

      expect(result).toEqual({
        commandId: UUID,
        accepted: false,
        error: INTERNAL_ERROR,
      })
      expect(snapshot()).toEqual(before)
    })

    it('an unknown command type is InternalError', () => {
      expect(send(ALICE, command('Cheat', { amount: 9 }))).toEqual({
        commandId: UUID,
        accepted: false,
        error: INTERNAL_ERROR,
      })
    })

    it('an unreadable envelope is InternalError with no id to answer', () => {
      expect(send(ALICE, 'not even an object')).toEqual({
        commandId: undefined,
        accepted: false,
        error: INTERNAL_ERROR,
      })
    })

    it('an engine throw is InternalError, never a refusal and never an exception', () => {
      // 'nobody' is not seated: the board throws on it, which is the
      // engine reporting a bug in whoever bound this identity.
      const result = send(
        'nobody',
        command('ApplyModifier', {
          cardId: 'modifier-080',
          targetPlayerId: ALICE,
          value: 2,
        }),
      )

      expect(result).toEqual({
        commandId: UUID,
        accepted: false,
        error: INTERNAL_ERROR,
      })
    })
  })

  it('the command id is the action id, so a log line can be matched to its request', () => {
    // A second identical request is a new action with the same id: the
    // engine does not dedupe (that is the gateway's job), it just executes.
    const before = see(t, ALICE).hand.length
    send(ALICE, command('DrawCard', {}, UUID))
    send(ALICE, command('DrawCard', {}, UUID))
    expect(see(t, ALICE).hand).toHaveLength(before + 2)
  })

  it('hands are dealt as the spec says, so the cases above mean what they say', () => {
    const alice = see(t, ALICE)
    expect(alice.hand.map((c) => c.id)).toEqual(['hero-001', 'modifier-080'])
    expect(alice.hand.find((c) => c.id === 'modifier-080')?.type).toBe(
      CardType.Modifier,
    )
    expect(see(t, BOB).hand.map((c) => c.id)).toEqual([
      'hero-002',
      'modifier-081',
    ])
  })
})
