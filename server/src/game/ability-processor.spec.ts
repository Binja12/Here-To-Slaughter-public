import { ICard, IGameEvent, GameEventType, Audience, CardType } from 'shared'
import { AbilityProcessor } from './ability-processor'
import { GameState } from './game-state'
import { CardStack } from './card-stack'
import { CardPile } from './card-pile'
import { AbilityContext } from './ability-context'
import { IAbility, ITask } from './interfaces'
import { GameEvent } from './events/game-event'
import { GameEventEmitter } from './events/game-event-emitter'
import { Player } from './player'
import { Party } from './party'
import { HeroCard } from './cards/hero-card'
import { HeroClass } from 'shared'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const makeTask = (events: IGameEvent[] = [], spy?: () => void): ITask => ({
  execute: (_gs, _ctx, em) => {
    spy?.()
    for (const e of events) em.emit(e)
  },
})

/** Minimal ICard that also exposes getAbility() for duck-typing. */
const makeFakeCard = (id: string, ability?: IAbility): ICard & { getAbility(): IAbility | undefined } => ({
  getId: () => id,
  getName: () => id,
  getType: () => CardType.Hero,
  getImage: () => '',
  getDescription: () => '',
  getAbility: () => ability,
})

/** Real HeroCard — needed when getEquippedItem() is exercised. */
const makeHeroCard = (
  id: string,
  ability?: IAbility,
  equippedItem?: string,
): HeroCard =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
    equippedItem,
    ability: ability as any,
  })

const makePlayer = (id: string) =>
  new Player({ id, name: id, hand: [], partyId: `${id}-party`, actionPoints: 3 })

const makeParty = (playerId: string, leaderId: string, heroIds: string[] = [], monsterIds: string[] = []) =>
  new Party({ playerId, leaderId, heroIds, monsterIds })

const makeEvent = (
  type: GameEventType,
  payload?: Record<string, unknown>,
): IGameEvent =>
  new GameEvent(type, 'p1', payload ?? {}, Audience.All)

// ---------------------------------------------------------------------------
// Helpers to populate GameState
// ---------------------------------------------------------------------------

function setupPlayer(
  gs: GameState,
  playerId: string,
  leaderId: string,
  heroes: Array<{ cardId: string; ability?: IAbility }> = [],
): void {
  gs.registerPlayer(makePlayer(playerId))
  const heroIds = heroes.map((h) => h.cardId)
  gs.registerParty(makeParty(playerId, leaderId, heroIds))
  gs.registerCard(makeFakeCard(leaderId)) // leader without ability by default
  for (const { cardId, ability } of heroes) {
    gs.registerCard(makeFakeCard(cardId, ability))
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AbilityProcessor', () => {
  // -------------------------------------------------------------------------
  // process()
  // -------------------------------------------------------------------------

  describe('process()', () => {
    it('does nothing for an ability with no steps', () => {
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      const ap = new AbilityProcessor(makeGs(), emitter)
      ap.process({ steps: [] }, makeGs(), new AbilityContext('card-1', 'p1'))

      expect(received).toHaveLength(0)
    })

    it('executes all steps and emits their events', () => {
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      const ap = new AbilityProcessor(makeGs(), emitter)
      const e1 = new GameEvent(GameEventType.CardDrawn, 'p1', {}, Audience.PlayerOnly)
      const e2 = new GameEvent(GameEventType.CardDrawn, 'p1', {}, Audience.PlayerOnly)
      ap.process({ steps: [makeTask([e1]), makeTask([e2])] }, makeGs(), new AbilityContext('card-1', 'p1'))

      expect(received).toContain(e1)
      expect(received).toContain(e2)
    })

    it('executes steps in order', () => {
      const ap = new AbilityProcessor(makeGs(), new GameEventEmitter())
      const order: number[] = []
      const ability: IAbility = {
        steps: [
          { execute: () => { order.push(1) } },
          { execute: () => { order.push(2) } },
        ],
      }
      ap.process(ability, makeGs(), new AbilityContext('c', 'p'))
      expect(order).toEqual([1, 2])
    })

    it('passes the shared emitter into each task', () => {
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      const ap = new AbilityProcessor(makeGs(), emitter)
      const taskEvent = new GameEvent(GameEventType.CardDrawn, 'p1', {}, Audience.PlayerOnly)
      ap.process({ steps: [makeTask([taskEvent])] }, makeGs(), new AbilityContext('c', 'p'))

      expect(received).toContain(taskEvent)
    })
  })

  // -------------------------------------------------------------------------
  // onEvent() — scan-based passive triggering
  // -------------------------------------------------------------------------

  describe('onEvent()', () => {
    it('does not crash when GameState has no players', () => {
      const ap = new AbilityProcessor(makeGs(), new GameEventEmitter())
      expect(() => ap.onEvent(makeEvent(GameEventType.DiceRolled))).not.toThrow()
    })

    // -----------------------------------------------------------------------
    // Passive sources — leaders, equipped items, monsters
    // Fire on trigger match alone; payload is irrelevant.
    // -----------------------------------------------------------------------

    it('fires leader ability when trigger matches', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', {
        trigger: GameEventType.DiceRolled,
        steps: [makeTask([], () => fired.push(true))],
      }))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(1)
    })

    it('fires leader ability even when payload carries an unrelated cardId', () => {
      // Passive sources are NOT filtered by payload.cardId — they always fire on trigger match
      const gs = makeGs()
      const fired: boolean[] = []
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', {
        trigger: GameEventType.DiceRolled,
        steps: [makeTask([], () => fired.push(true))],
      }))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled, { cardId: 'some-other-card' }))

      expect(fired).toHaveLength(1)
    })

    it('fires passive abilities for all players whose leader trigger matches', () => {
      const gs = makeGs()
      const firedBy: string[] = []

      const makeAbility = (tag: string): IAbility => ({
        trigger: GameEventType.DiceRolled,
        steps: [makeTask([], () => firedBy.push(tag))],
      })

      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', makeAbility('p1-leader')))

      gs.registerPlayer(makePlayer('p2'))
      gs.registerParty(makeParty('p2', 'leader-2'))
      gs.registerCard(makeFakeCard('leader-2', makeAbility('p2-leader')))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(firedBy).toContain('p1-leader')
      expect(firedBy).toContain('p2-leader')
    })

    it('fires monster ability when trigger matches', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1', [], ['monster-1']))
      gs.registerCard(makeFakeCard('leader-1'))
      gs.registerCard(makeFakeCard('monster-1', {
        trigger: GameEventType.DiceRolled,
        steps: [makeTask([], () => fired.push(true))],
      }))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(1)
    })

    it('fires equipped item ability when trigger matches', () => {
      const gs = makeGs()
      const fired: boolean[] = []

      const hero = makeHeroCard('hero-1', undefined, 'item-1')
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1', ['hero-1']))
      gs.registerCard(makeFakeCard('leader-1'))
      gs.registerCard(hero)
      gs.registerCard(makeFakeCard('item-1', {
        trigger: GameEventType.DiceRolled,
        steps: [makeTask([], () => fired.push(true))],
      }))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(1)
    })

    it('does NOT fire equipped item ability when hero has no item', () => {
      const gs = makeGs()
      const fired: boolean[] = []

      const hero = makeHeroCard('hero-1', undefined, undefined)
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1', ['hero-1']))
      gs.registerCard(makeFakeCard('leader-1'))
      gs.registerCard(hero)

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(0)
    })

    it('skips passive cards with no ability', () => {
      const gs = makeGs()
      setupPlayer(gs, 'p1', 'leader-1') // leader has no ability

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      expect(() => ap.onEvent(makeEvent(GameEventType.DiceRolled))).not.toThrow()
    })

    it('skips passive cards whose ability has no trigger', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', { steps: [makeTask([], () => fired.push(true))] }))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(0)
    })

    // -----------------------------------------------------------------------
    // Active sources — heroes
    // Only fire when payload.cardId matches the hero's id.
    // -----------------------------------------------------------------------

    it('fires hero ability when payload.cardId matches', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      setupPlayer(gs, 'p1', 'leader-1', [
        { cardId: 'hero-1', ability: { trigger: GameEventType.RollSuccess, steps: [makeTask([], () => fired.push(true))] } },
      ])

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.RollSuccess, { cardId: 'hero-1' }))

      expect(fired).toHaveLength(1)
    })

    it('does NOT fire hero ability when payload has no cardId', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      setupPlayer(gs, 'p1', 'leader-1', [
        { cardId: 'hero-1', ability: { trigger: GameEventType.DiceRolled, steps: [makeTask([], () => fired.push(true))] } },
      ])

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled)) // no cardId in payload

      expect(fired).toHaveLength(0)
    })

    it('does NOT fire hero ability when payload.cardId targets a different hero', () => {
      const gs = makeGs()
      const firedBy: string[] = []

      const makeAbility = (tag: string): IAbility => ({
        trigger: GameEventType.RollSuccess,
        steps: [makeTask([], () => firedBy.push(tag))],
      })

      setupPlayer(gs, 'p1', 'leader-1', [
        { cardId: 'hero-1', ability: makeAbility('hero-1') },
        { cardId: 'hero-2', ability: makeAbility('hero-2') },
      ])

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.RollSuccess, { cardId: 'hero-1' }))

      expect(firedBy).toContain('hero-1')
      expect(firedBy).not.toContain('hero-2')
    })

    // -----------------------------------------------------------------------
    // Event propagation & context
    // -----------------------------------------------------------------------

    it('emits events produced by a triggered passive task through the shared emitter', () => {
      const gs = makeGs()
      const emitter = new GameEventEmitter()
      const received: IGameEvent[] = []
      emitter.addListener({ onEvent: (e) => received.push(e) })

      const taskEvent = new GameEvent(GameEventType.CardDrawn, 'p1', {}, Audience.PlayerOnly)
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', { trigger: GameEventType.DiceRolled, steps: [makeTask([taskEvent])] }))

      const ap = new AbilityProcessor(gs, emitter)
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(received).toContain(taskEvent)
    })

    it('passes correct cardId and ownerId to AbilityContext', () => {
      const gs = makeGs()
      let capturedCtx: AbilityContext | undefined

      const step: ITask = { execute: (_gs, ctx, _em) => { capturedCtx = ctx } }

      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', { trigger: GameEventType.DiceRolled, steps: [step] }))

      const ap = new AbilityProcessor(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(capturedCtx).toBeDefined()
      expect(capturedCtx!.sourceCardId).toBe('leader-1')
      expect(capturedCtx!.ownerId).toBe('p1')
    })
  })
})
