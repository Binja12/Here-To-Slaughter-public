import {
  ActionType,
  CardType,
  EffectDuration,
  GameEventType,
  HeroClass,
} from 'shared'
import { PlayCardAction } from './play-card-action'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { HeroCard } from '../cards/hero-card'
import { MagicCard } from '../cards/magic-card'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../game-event-emitter'
import { AbilityProcessor } from '../ability-processor'

const makeHeroCard = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    effect: { duration: EffectDuration.TurnEnd },
  })

const makeMagicCard = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    effect: { duration: EffectDuration.TurnEnd },
  })

const makeGs = (
  handCards: string[],
  registeredCards: any[] = [],
  actionPoints = 3,
) => {
  const deck = new CardStack('deck', 'main')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: handCards,
    partyId: 'party-1',
    actionPoints,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds: [],
    MonsterIds: [],
  })
  const gs = new GameState(deck)
  gs.registerPlayer(player)
  gs.registerParty(party)
  for (const card of registeredCards) gs.registerCard(card)
  return { gs, player, party }
}

/** Stub ReactionManager that captures openChallengeWindow calls and its onSuccess. */
const makeReactionManager = (gs: GameState) => {
  const emitter = new GameEventEmitter()
  const ap = new AbilityProcessor(gs, emitter)
  const captured: { options: any }[] = []
  const rm = new ReactionManager(gs, emitter, ap, () => {})
  rm.openChallengeWindow = (opts) => {
    captured.push({ options: opts })
  }
  ;(rm as any)._captured = captured
  return { rm, emitter }
}

describe('PlayCardAction', () => {
  it('should have type PlayCard', () => {
    const { gs } = makeGs([])
    const { rm } = makeReactionManager(gs)
    expect(new PlayCardAction('play-1', 'p1', 'card-1', rm).getType()).toBe(
      ActionType.PlayCard,
    )
  })

  it('should return the injected id', () => {
    const { gs } = makeGs([])
    const { rm } = makeReactionManager(gs)
    expect(new PlayCardAction('my-id', 'p1', 'card-1', rm).getId()).toBe(
      'my-id',
    )
  })

  it('should have cost 1', () => {
    const { gs } = makeGs([])
    const { rm } = makeReactionManager(gs)
    expect(new PlayCardAction('p', 'p1', 'card-1', rm).getCost()).toBe(1)
  })

  it('should be challengeable', () => {
    const { gs } = makeGs([])
    const { rm } = makeReactionManager(gs)
    expect(new PlayCardAction('p', 'p1', 'card-1', rm).isChallengeable()).toBe(
      true,
    )
  })

  describe('canExecute()', () => {
    it('should return false for unknown player', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      expect(
        new PlayCardAction('p', 'unknown', 'hero-1', rm).canExecute(gs),
      ).toBe(false)
    })

    it('should return false when player has no action points', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero], 0)
      const { rm } = makeReactionManager(gs)
      expect(new PlayCardAction('p', 'p1', 'hero-1', rm).canExecute(gs)).toBe(
        false,
      )
    })

    it('should return false when card not in hand', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs([], [hero])
      const { rm } = makeReactionManager(gs)
      expect(new PlayCardAction('p', 'p1', 'hero-1', rm).canExecute(gs)).toBe(
        false,
      )
    })

    it('should return true when card is in hand with AP available', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      expect(new PlayCardAction('p', 'p1', 'hero-1', rm).canExecute(gs)).toBe(
        true,
      )
    })
  })

  describe('execute()', () => {
    it('should remove the card from hand immediately (cost paid)', () => {
      const hero = makeHeroCard('hero-1')
      const { gs, player } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      new PlayCardAction('p', 'p1', 'hero-1', rm).execute(gs)
      expect(player.getHand()).not.toContain('hero-1')
    })

    it('should deduct 1 action point', () => {
      const hero = makeHeroCard('hero-1')
      const { gs, player } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      new PlayCardAction('p', 'p1', 'hero-1', rm).execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('should emit CardPlayAttempted event', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      const events = new PlayCardAction('p', 'p1', 'hero-1', rm).execute(gs)
      expect(
        events.some((e) => e.getType() === GameEventType.CardPlayAttempted),
      ).toBe(true)
    })

    it('should open a challenge window via ReactionManager', () => {
      const hero = makeHeroCard('hero-1')
      const { gs } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      new PlayCardAction('p', 'p1', 'hero-1', rm).execute(gs)
      expect((rm as any)._captured).toHaveLength(1)
    })

    it('should NOT immediately add hero to party — deferred to onSuccess', () => {
      const hero = makeHeroCard('hero-1')
      const { gs, party } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      new PlayCardAction('p', 'p1', 'hero-1', rm).execute(gs)
      expect(party.getHeroIds()).not.toContain('hero-1')
    })

    it('onSuccess: should add hero to party and emit HeroAdded', () => {
      const hero = makeHeroCard('hero-1')
      const { gs, party } = makeGs(['hero-1'], [hero])
      const { rm } = makeReactionManager(gs)
      new PlayCardAction('p', 'p1', 'hero-1', rm).execute(gs)
      // Invoke the deferred onSuccess callback
      const onSuccess = (rm as any)._captured[0].options
        .onSuccess as () => any[]
      const successEvents = onSuccess()
      expect(party.getHeroIds()).toContain('hero-1')
      expect(
        successEvents.some((e: any) => e.getType() === GameEventType.HeroAdded),
      ).toBe(true)
    })

    it('onSuccess: magic card should emit CardPlayed', () => {
      const magic = makeMagicCard('magic-1')
      const { gs } = makeGs(['magic-1'], [magic])
      const { rm } = makeReactionManager(gs)
      new PlayCardAction('p', 'p1', 'magic-1', rm).execute(gs)
      const onSuccess = (rm as any)._captured[0].options
        .onSuccess as () => any[]
      const successEvents = onSuccess()
      expect(
        successEvents.some(
          (e: any) => e.getType() === GameEventType.CardPlayed,
        ),
      ).toBe(true)
    })
  })
})
