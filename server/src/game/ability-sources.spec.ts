import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  TriggerScope,
} from 'shared'
import { GameState } from './game-state'
import { CardStack } from './card-stack'
import { CardPile } from './card-pile'
import { Player } from './player'
import { Party } from './party'
import { HeroCard } from './cards/hero-card'
import { GameEvent } from './events/game-event'
import { GameEventEmitter } from './events/game-event-emitter'
import { AbilityProcessor } from './ability-processor'
import { ReactionManager } from './reactions/reaction-manager'
import { AbilityContext, CTX_CHOSEN_CARD } from './ability-context'
import { IAbility } from './interfaces'
import { StealFromPartyTask } from './tasks/tasks'

// ---------------------------------------------------------------------------
// Trigger scope — WHOSE events a card ability listens to.
//
// A card ability is live because the card is in play; the processor reads it
// from the party each event. Scope is the declarative answer to "whose events
// count", replacing the payload.cardId check that used to be hard-coded for
// heroes and absent for everything else — which could not express a card
// reacting to ANOTHER player's roll.
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const hero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass: HeroClass.Fighter,
    rollReq: 5,
  })

function seat(gs: GameState, playerId: string, heroIds: string[] = []): void {
  gs.registerPlayer(
    new Player({
      id: playerId,
      name: playerId,
      hand: [],
      partyId: `${playerId}-party`,
      actionPoints: 3,
    }),
  )
  gs.registerParty(
    new Party({
      playerId,
      leaderId: `${playerId}-leader`,
      heroIds,
      monsterIds: [],
    }),
  )
}

function setup(abilities: Map<string, IAbility[]> = new Map()) {
  const gs = makeGs()
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new AbilityProcessor(gs, em, rm, abilities)
  return { gs, em, rm, events }
}

/** Records every owner the ability ran for, so scope is directly observable. */
const spyAbility = (
  on: GameEventType,
  scope: TriggerScope,
  ranFor: string[],
): IAbility => ({
  trigger: { on, scope },
  steps: [{ execute: (_gs, ctx) => {
        ranFor.push(ctx.ownerId)
      } }],
})

const rolled = (playerId: string, cardId?: string) =>
  new GameEvent(GameEventType.DiceRolled, playerId, cardId ? { cardId } : {})

describe('trigger scope', () => {
  it('SelfCard fires only when the event names this card', () => {
    const ranFor: string[] = []
    const { gs, em } = setup(
      new Map([
        [
          'hero-1',
          [spyAbility(GameEventType.DiceRolled, TriggerScope.SelfCard, ranFor)],
        ],
      ]),
    )
    seat(gs, 'p1', ['hero-1'])
    gs.registerCard(hero('hero-1'))

    em.emit(rolled('p1', 'someone-else'))
    expect(ranFor).toHaveLength(0)

    em.emit(rolled('p1', 'hero-1'))
    expect(ranFor).toEqual(['p1'])
  })

  it("Anyone fires on another player's event — the case the old check could not express", () => {
    // The expansion's "-1 to a roll" card: it must see rolls that are neither
    // the owner's nor named after it.
    const ranFor: string[] = []
    const { gs, em } = setup(
      new Map([
        [
          'hero-1',
          [spyAbility(GameEventType.DiceRolled, TriggerScope.Anyone, ranFor)],
        ],
      ]),
    )
    seat(gs, 'p1', ['hero-1'])
    seat(gs, 'p2')
    gs.registerCard(hero('hero-1'))

    em.emit(rolled('p2', 'p2-hero'))

    expect(ranFor).toEqual(['p1'])
  })

  it("OwnerEvent fires for the owner's events only", () => {
    const ranFor: string[] = []
    const { gs, em } = setup(
      new Map([
        [
          'hero-1',
          [spyAbility(GameEventType.DiceRolled, TriggerScope.OwnerEvent, ranFor)],
        ],
      ]),
    )
    seat(gs, 'p1', ['hero-1'])
    seat(gs, 'p2')
    gs.registerCard(hero('hero-1'))

    em.emit(rolled('p2'))
    expect(ranFor).toHaveLength(0)

    em.emit(rolled('p1'))
    expect(ranFor).toEqual(['p1'])
  })

  it("OwnerTurn fires only while it is the owner's turn", () => {
    const ranFor: string[] = []
    const { gs, em } = setup(
      new Map([
        [
          'hero-1',
          [spyAbility(GameEventType.DiceRolled, TriggerScope.OwnerTurn, ranFor)],
        ],
      ]),
    )
    seat(gs, 'p1', ['hero-1'])
    seat(gs, 'p2')
    gs.registerCard(hero('hero-1'))

    gs.setCurrentPlayerId('p2')
    em.emit(rolled('p2'))
    expect(ranFor).toHaveLength(0)

    gs.setCurrentPlayerId('p1')
    em.emit(rolled('p2')) // someone else's roll, but on the owner's turn
    expect(ranFor).toEqual(['p1'])
  })
})

// ---------------------------------------------------------------------------
// Eligibility follows the card, with nothing to keep in sync
// ---------------------------------------------------------------------------

describe('a card ability is live because the card is in play', () => {
  it('a hero leaving the party stops firing, with no bookkeeping', () => {
    const ranFor: string[] = []
    const { gs, em } = setup(
      new Map([
        [
          'hero-1',
          [spyAbility(GameEventType.DiceRolled, TriggerScope.Anyone, ranFor)],
        ],
      ]),
    )
    seat(gs, 'p1', ['hero-1'])
    gs.registerCard(hero('hero-1'))

    em.emit(rolled('p1'))
    expect(ranFor).toEqual(['p1'])

    gs.getParty('p1').removeHero('hero-1', em, 'Destroyed')
    em.emit(rolled('p1'))

    expect(ranFor).toEqual(['p1']) // no second run
  })

  it("a stolen hero's ability belongs to the thief immediately", () => {
    const ranFor: string[] = []
    const { gs, em, rm } = setup(
      new Map([
        [
          'victim',
          [spyAbility(GameEventType.DiceRolled, TriggerScope.OwnerEvent, ranFor)],
        ],
      ]),
    )
    seat(gs, 'p1')
    seat(gs, 'p2', ['victim'])
    gs.registerCard(hero('victim'))

    const ctx = new AbilityContext('thief-card', 'p1')
    ctx.set(CTX_CHOSEN_CARD, ['victim'])
    new StealFromPartyTask().execute(gs, ctx, em, rm)

    em.emit(rolled('p2'))
    expect(ranFor).toHaveLength(0) // no longer p2's ability

    em.emit(rolled('p1'))
    expect(ranFor).toEqual(['p1']) // now the thief's, derived from the party
  })
})
