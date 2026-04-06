import {
  ActionType,
  CardType,
  EffectDuration,
  GameEventType,
  HeroClass,
} from 'shared'
import { RollOnHeroAction } from './roll-on-hero-action'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { HeroCard } from '../cards/hero-card'
import { IAbility } from '../interfaces'
import { ReactionManager } from '../reactions/reaction-manager'
import { GameEventEmitter } from '../game-event-emitter'
import { AbilityProcessor } from '../ability-processor'

const makeHeroCard = (id: string, rollReq: number, ability?: IAbility) =>
  new HeroCard(
    {
      id,
      name: id,
      type: CardType.Hero,
      image: '',
      description: '',
      heroClass: HeroClass.Wizard,
      rollReq,
      effect: { duration: EffectDuration.TurnEnd },
    },
    ability,
  )

const makeGs = (
  heroIds: string[] = ['hero-1'],
  abilitiesUsed: string[] = [],
  actionPoints = 3,
) => {
  const deck = new CardStack('deck', 'main')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPoints,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds,
    MonsterIds: [],
  })
  const gs = new GameState(deck)
  gs.registerPlayer(player)
  gs.registerParty(party)
  for (const id of abilitiesUsed) gs.markAbilityUsed(id)
  return gs
}

/** Stub ReactionManager — captures openModifierWindow calls. */
const makeReactionManager = (gs: GameState) => {
  const emitter = new GameEventEmitter()
  const ap = new AbilityProcessor(gs, emitter)
  const openedWindows: any[] = []
  const rm = new ReactionManager(gs, emitter, ap, () => {})
  const original = rm.openModifierWindow.bind(rm)
  rm.openModifierWindow = (opts) => {
    openedWindows.push(opts)
    original(opts)
  }
  ;(rm as any)._openedWindows = openedWindows
  return rm
}

describe('RollOnHeroAction', () => {
  it('should have type RollOnHero', () => {
    const gs = makeGs()
    const rm = makeReactionManager(gs)
    expect(new RollOnHeroAction('roll-1', 'p1', 'hero-1', rm).getType()).toBe(
      ActionType.RollOnHero,
    )
  })

  it('should return the injected id', () => {
    const gs = makeGs()
    const rm = makeReactionManager(gs)
    expect(new RollOnHeroAction('my-id', 'p1', 'hero-1', rm).getId()).toBe(
      'my-id',
    )
  })

  it('should have cost 1', () => {
    const gs = makeGs()
    expect(
      new RollOnHeroAction(
        'r',
        'p1',
        'hero-1',
        makeReactionManager(gs),
      ).getCost(),
    ).toBe(1)
  })

  it('should not be challengeable', () => {
    const gs = makeGs()
    expect(
      new RollOnHeroAction(
        'r',
        'p1',
        'hero-1',
        makeReactionManager(gs),
      ).isChallengeable(),
    ).toBe(false)
  })

  describe('canExecute()', () => {
    it('should return false for unknown player', () => {
      const gs = makeGs(['hero-1'])
      expect(
        new RollOnHeroAction(
          'r',
          'unknown',
          'hero-1',
          makeReactionManager(gs),
        ).canExecute(gs),
      ).toBe(false)
    })

    it('should return false when player has no action points', () => {
      const gs = makeGs(['hero-1'], [], 0)
      expect(
        new RollOnHeroAction(
          'r',
          'p1',
          'hero-1',
          makeReactionManager(gs),
        ).canExecute(gs),
      ).toBe(false)
    })

    it('should return false when hero not in party', () => {
      const gs = makeGs(['hero-2'])
      expect(
        new RollOnHeroAction(
          'r',
          'p1',
          'hero-1',
          makeReactionManager(gs),
        ).canExecute(gs),
      ).toBe(false)
    })

    it('should return false when ability already used this turn', () => {
      const gs = makeGs(['hero-1'], ['hero-1'])
      expect(
        new RollOnHeroAction(
          'r',
          'p1',
          'hero-1',
          makeReactionManager(gs),
        ).canExecute(gs),
      ).toBe(false)
    })

    it('should return true when all conditions pass', () => {
      const gs = makeGs(['hero-1'])
      expect(
        new RollOnHeroAction(
          'r',
          'p1',
          'hero-1',
          makeReactionManager(gs),
        ).canExecute(gs),
      ).toBe(true)
    })
  })

  describe('execute()', () => {
    it('should emit a DiceRolled event', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 4)
      gs.registerCard(card)
      const events = new RollOnHeroAction(
        'r',
        'p1',
        'hero-1',
        makeReactionManager(gs),
      ).execute(gs)
      expect(events.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(
        true,
      )
    })

    it('should deduct 1 action point from the player', () => {
      const gs = makeGs(['hero-1'])
      const player = gs.getPlayer('p1')!
      new RollOnHeroAction(
        'r',
        'p1',
        'hero-1',
        makeReactionManager(gs),
      ).execute(gs)
      expect(player.getActionPoints()).toBe(2)
    })

    it('should open a modifier window via ReactionManager', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 4)
      gs.registerCard(card)
      const rm = makeReactionManager(gs)
      new RollOnHeroAction('r', 'p1', 'hero-1', rm).execute(gs)
      expect((rm as any)._openedWindows).toHaveLength(1)
    })

    it('should pass the hero rollReq to the modifier window', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 5)
      gs.registerCard(card)
      const rm = makeReactionManager(gs)
      new RollOnHeroAction('r', 'p1', 'hero-1', rm).execute(gs)
      expect((rm as any)._openedWindows[0].rollReq).toBe(5)
    })

    it('should open a reaction window in GameState', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 1)
      gs.registerCard(card)
      new RollOnHeroAction(
        'r',
        'p1',
        'hero-1',
        makeReactionManager(gs),
      ).execute(gs)
      expect(gs.hasOpenReactionWindow()).toBe(true)
    })
  })
})
