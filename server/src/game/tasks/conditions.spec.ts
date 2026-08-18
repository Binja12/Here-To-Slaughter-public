import { CardType, GameEventType, HeroClass, IGameEvent } from 'shared'
import { CardTypeCondition } from './conditions'
import { DrawTask } from './tasks'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_DRAWN_CARD_IDS,
} from '../ability-context'
import { ITask } from '../interfaces'
import { GameEventEmitter } from '../events/game-event-emitter'
import type { ReactionManager } from '../reactions/reaction-manager'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = (deckCards: string[] = []) => {
  const deck = new CardStack('deck', 'main')
  for (const c of deckCards) deck.addToBottom(c)
  const gs = new GameState(
    deck,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerPlayer(
    new Player({ id: 'p1', name: 'P1', hand: [], partyId: 'party-1', actionPoints: 3 }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'leader-1', heroIds: [], monsterIds: [] }),
  )
  return gs
}

const makeCtx = () => new AbilityContext('src', 'p1')
const makeEmitter = () => new GameEventEmitter()

/** Stub ReactionManager — tasks under test don't open frames. */
const stubRm = null as unknown as ReactionManager

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
  })

// ---------------------------------------------------------------------------
// CardTypeCondition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests
//
// The condition holds no steps: it announces ConditionMet and whatever it
// guards lives in a separate registry entry triggered by that event.
// ---------------------------------------------------------------------------

const LABEL = 'DrewMagic'

const collect = (em: GameEventEmitter) => {
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return events
}

const metEvents = (events: IGameEvent[]) =>
  events.filter((e) => e.getType() === GameEventType.ConditionMet)

describe('CardTypeCondition', () => {
  it('announces ConditionMet when a card in the slot has the type', () => {
    const gs = makeGs()
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    ctx.set(CTX_DRAWN_CARD_IDS, ['magic-1'])
    const em = new GameEventEmitter()
    const events = collect(em)

    new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, LABEL).execute(
      gs, ctx, em, stubRm,
    )

    expect(metEvents(events)).toHaveLength(1)
    expect(metEvents(events)[0].getPayload()).toMatchObject({
      cardId: 'src',
      label: LABEL,
    })
  })

  it('announces NOTHING when the type does not match', () => {
    const gs = makeGs()
    gs.registerCard(makeHeroCard('hero-1'))
    const ctx = makeCtx()
    ctx.set(CTX_DRAWN_CARD_IDS, ['hero-1'])
    const em = new GameEventEmitter()
    const events = collect(em)

    new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, LABEL).execute(
      gs, ctx, em, stubRm,
    )

    // "False" is the absence of the event — the guarded entry never triggers,
    // and there is no branch to skip past.
    expect(metEvents(events)).toHaveLength(0)
  })

  it('is false for an absent or empty slot', () => {
    const gs = makeGs()
    const ctx = makeCtx()
    const em = new GameEventEmitter()
    const events = collect(em)
    const cond = new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, LABEL)

    cond.execute(gs, ctx, em, stubRm) // absent
    ctx.set(CTX_DRAWN_CARD_IDS, [])
    cond.execute(gs, ctx, em, stubRm) // empty

    expect(metEvents(events)).toHaveLength(0)
  })

  it('reads whichever slot it was given, not just drawn cards', () => {
    const gs = makeGs()
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    // A CHOSEN card, not a drawn one — the condition has no opinion about
    // where the id came from.
    ctx.set(CTX_CHOSEN_CARD, ['magic-1'])
    const em = new GameEventEmitter()
    const events = collect(em)

    new CardTypeCondition(CardType.Magic, CTX_CHOSEN_CARD, LABEL).execute(
      gs, ctx, em, stubRm,
    )

    expect(metEvents(events)).toHaveLength(1)
  })

  it('holds when ANY card in the slot has the type', () => {
    const gs = makeGs()
    gs.registerCard(makeHeroCard('hero-1'))
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    ctx.set(CTX_DRAWN_CARD_IDS, ['hero-1', 'magic-1'])
    const em = new GameEventEmitter()
    const events = collect(em)

    new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, LABEL).execute(
      gs, ctx, em, stubRm,
    )

    // "did this produce a Magic card", not "was the last one Magic"
    expect(metEvents(events)).toHaveLength(1)
  })

  it('seeds the tested slot onto the event for the entry it unlocks', () => {
    const gs = makeGs()
    gs.registerCard(makeMagicCard('magic-1'))
    const ctx = makeCtx()
    ctx.set(CTX_DRAWN_CARD_IDS, ['magic-1'])
    const em = new GameEventEmitter()
    const events = collect(em)

    new CardTypeCondition(CardType.Magic, CTX_DRAWN_CARD_IDS, LABEL).execute(
      gs, ctx, em, stubRm,
    )

    // The continuation runs with a fresh context, so the cards it was asked
    // about have to travel with the event.
    expect(metEvents(events)[0].getPayload()).toMatchObject({
      ctxSeed: { drawnCardIds: ['magic-1'] },
    })
  })
})
