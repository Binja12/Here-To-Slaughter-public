import {
  ICard,
  IGameEvent,
  GameEventType,
  Audience,
  CardType,
  TriggerScope,
} from 'shared'
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
import { ReactionManager } from './reactions/reaction-manager'

const makeRm = (gs: GameState, em: GameEventEmitter) =>
  new ReactionManager(gs, em)

/**
 * Stands in for the real ability registry: behaviour is bound to a card ID
 * here, not carried on the card itself. The builders below write into it, so a
 * test still declares a card and its ability in one place.
 */
let abilities = new Map<string, IAbility>()
beforeEach(() => {
  abilities = new Map()
})

const makeAp = (gs: GameState, em: GameEventEmitter) =>
  new AbilityProcessor(gs, em, makeRm(gs, em), abilities)

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
  execute: (_gs, _ctx, em, _rm) => {
    spy?.()
    for (const e of events) em.emit(e)
  },
})

/** Minimal ICard. Any ability passed is registered against the card's id. */
const makeFakeCard = (id: string, ability?: IAbility): ICard => {
  if (ability) abilities.set(id, ability)
  return {
    getId: () => id,
    getName: () => id,
    getType: () => CardType.Hero,
    getImage: () => '',
    getDescription: () => '',
  }
}

/** Real HeroCard — needed when getEquippedItem() is exercised. */
const makeHeroCard = (
  id: string,
  ability?: IAbility,
  equippedItem?: string,
): HeroCard => {
  if (ability) abilities.set(id, ability)
  return new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
    equippedItem,
  })
}

const makePlayer = (id: string) =>
  new Player({
    id,
    name: id,
    hand: [],
    partyId: `${id}-party`,
    actionPoints: 3,
  })

const makeParty = (
  playerId: string,
  leaderId: string,
  heroIds: string[] = [],
  monsterIds: string[] = [],
) => new Party({ playerId, leaderId, heroIds, monsterIds })

const makeEvent = (
  type: GameEventType,
  payload?: Record<string, unknown>,
): IGameEvent => new GameEvent(type, 'p1', payload ?? {}, Audience.All)

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
  // onEvent() — scan-based passive triggering
  // -------------------------------------------------------------------------

  describe('onEvent()', () => {
    it('does not crash when GameState has no players', () => {
      const ap = makeAp(makeGs(), new GameEventEmitter())
      expect(() =>
        ap.onEvent(makeEvent(GameEventType.DiceRolled)),
      ).not.toThrow()
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
      gs.registerCard(
        makeFakeCard('leader-1', {
          trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
          steps: [makeTask([], () => fired.push(true))],
        }),
      )

      const ap = makeAp(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(1)
    })

    it('fires leader ability even when payload carries an unrelated cardId', () => {
      // Passive sources are NOT filtered by payload.cardId — they always fire on trigger match
      const gs = makeGs()
      const fired: boolean[] = []
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(
        makeFakeCard('leader-1', {
          trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
          steps: [makeTask([], () => fired.push(true))],
        }),
      )

      const ap = makeAp(gs, new GameEventEmitter())
      ap.onEvent(
        makeEvent(GameEventType.DiceRolled, { cardId: 'some-other-card' }),
      )

      expect(fired).toHaveLength(1)
    })

    it('fires passive abilities for all players whose leader trigger matches', () => {
      const gs = makeGs()
      const firedBy: string[] = []

      const makeAbility = (tag: string): IAbility => ({
        trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
        steps: [makeTask([], () => firedBy.push(tag))],
      })

      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(makeFakeCard('leader-1', makeAbility('p1-leader')))

      gs.registerPlayer(makePlayer('p2'))
      gs.registerParty(makeParty('p2', 'leader-2'))
      gs.registerCard(makeFakeCard('leader-2', makeAbility('p2-leader')))

      const ap = makeAp(gs, new GameEventEmitter())
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
      gs.registerCard(
        makeFakeCard('monster-1', {
          trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
          steps: [makeTask([], () => fired.push(true))],
        }),
      )

      const ap = makeAp(gs, new GameEventEmitter())
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
      gs.registerCard(
        makeFakeCard('item-1', {
          trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
          steps: [makeTask([], () => fired.push(true))],
        }),
      )

      const ap = makeAp(gs, new GameEventEmitter())
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

      const ap = makeAp(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(fired).toHaveLength(0)
    })

    it('skips passive cards with no ability', () => {
      const gs = makeGs()
      setupPlayer(gs, 'p1', 'leader-1') // leader has no ability

      const ap = makeAp(gs, new GameEventEmitter())
      expect(() =>
        ap.onEvent(makeEvent(GameEventType.DiceRolled)),
      ).not.toThrow()
    })

    it('skips passive cards whose ability has no trigger', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(
        // Deliberately malformed: an ability with steps but no trigger. The type
        // forbids it, so the cast is what lets us assert the runtime guard.
        makeFakeCard('leader-1', {
          steps: [makeTask([], () => fired.push(true))],
        } as unknown as IAbility),
      )

      const ap = makeAp(gs, new GameEventEmitter())
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
        {
          cardId: 'hero-1',
          ability: {
            trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
            steps: [makeTask([], () => fired.push(true))],
          },
        },
      ])

      const ap = makeAp(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.RollSuccess, { cardId: 'hero-1' }))

      expect(fired).toHaveLength(1)
    })

    it('does NOT fire hero ability when payload has no cardId', () => {
      const gs = makeGs()
      const fired: boolean[] = []
      setupPlayer(gs, 'p1', 'leader-1', [
        {
          cardId: 'hero-1',
          ability: {
            // SelfCard needs the event to name this card; a payload-less event
            // cannot satisfy it.
            trigger: {
              on: GameEventType.DiceRolled,
              scope: TriggerScope.SelfCard,
            },
            steps: [makeTask([], () => fired.push(true))],
          },
        },
      ])

      const ap = makeAp(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled)) // no cardId in payload

      expect(fired).toHaveLength(0)
    })

    it('does NOT fire hero ability when payload.cardId targets a different hero', () => {
      const gs = makeGs()
      const firedBy: string[] = []

      const makeAbility = (tag: string): IAbility => ({
        trigger: { on: GameEventType.RollSuccess, scope: TriggerScope.SelfCard },
        steps: [makeTask([], () => firedBy.push(tag))],
      })

      setupPlayer(gs, 'p1', 'leader-1', [
        { cardId: 'hero-1', ability: makeAbility('hero-1') },
        { cardId: 'hero-2', ability: makeAbility('hero-2') },
      ])

      const ap = makeAp(gs, new GameEventEmitter())
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

      const taskEvent = new GameEvent(
        GameEventType.CardDrawn,
        'p1',
        {},
        Audience.PlayerOnly,
      )
      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(
        makeFakeCard('leader-1', {
          trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
          steps: [makeTask([taskEvent])],
        }),
      )

      const ap = makeAp(gs, emitter)
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(received).toContain(taskEvent)
    })

    it('passes correct cardId and ownerId to AbilityContext', () => {
      const gs = makeGs()
      let capturedCtx: AbilityContext | undefined

      const step: ITask = {
        execute: (_gs, ctx, _em) => {
          capturedCtx = ctx
        },
      }

      gs.registerPlayer(makePlayer('p1'))
      gs.registerParty(makeParty('p1', 'leader-1'))
      gs.registerCard(
        makeFakeCard('leader-1', {
          trigger: { on: GameEventType.DiceRolled, scope: TriggerScope.Anyone },
          steps: [step],
        }),
      )

      const ap = makeAp(gs, new GameEventEmitter())
      ap.onEvent(makeEvent(GameEventType.DiceRolled))

      expect(capturedCtx).toBeDefined()
      expect(capturedCtx!.sourceCardId).toBe('leader-1')
      expect(capturedCtx!.ownerId).toBe('p1')
    })
  })
})
