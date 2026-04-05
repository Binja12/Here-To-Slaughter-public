import {
  ActionType,
  CardType,
  EffectDuration,
  GameEventType,
  HeroClass,
  RollResult,
} from 'shared'
import { RollOnHeroAction } from './roll-on-hero-action'
import { GameState } from '../game-state'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { HeroCard } from '../cards/hero-card'
import { AbilityProcessor } from '../ability-processor.ts'
import { GameEventEmitter } from '../game-event-emitter'
import { IAbility, ITask } from '../interfaces'
import { IGameEvent } from 'shared'
import { GameEvent } from '../game-event'
import { Audience } from 'shared'

const makeHeroCard = (id: string, rollReq: number, ability?: IAbility) =>
  new HeroCard(
    {
      id,
      name: `Hero ${id}`,
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
) => {
  const deck = new CardStack('deck', 'main')
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPointsPerTurn: 3,
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

const makeAp = (gs: GameState) =>
  new AbilityProcessor(gs, new GameEventEmitter())

describe('RollOnHeroAction', () => {
  it('should have type RollOnHero', () => {
    const ap = makeAp(makeGs())
    expect(new RollOnHeroAction('p1', 'hero-1', ap).getType()).toBe(
      ActionType.RollOnHero,
    )
  })

  it('should have cost 1', () => {
    const ap = makeAp(makeGs())
    expect(new RollOnHeroAction('p1', 'hero-1', ap).getCost()).toBe(1)
  })

  describe('canExecute()', () => {
    it('should return false when hero not in party', () => {
      const gs = makeGs(['hero-2']) // hero-1 not present
      expect(
        new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).canExecute(gs),
      ).toBe(false)
    })

    it('should return false when ability already used this turn', () => {
      const gs = makeGs(['hero-1'], ['hero-1'])
      expect(
        new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).canExecute(gs),
      ).toBe(false)
    })

    it('should return true when hero is in party and ability not used', () => {
      const gs = makeGs(['hero-1'])
      expect(
        new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).canExecute(gs),
      ).toBe(true)
    })
  })

  describe('execute()', () => {
    it('should always emit a DiceRolled event', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 1) // rollReq=1, always succeeds
      gs.registerCard(card)
      const events = new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).execute(
        gs,
      )
      expect(events.some((e) => e.getType() === GameEventType.DiceRolled)).toBe(
        true,
      )
    })

    it('should mark ability used on success', () => {
      // Force success by setting rollReq = 1
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 1)
      gs.registerCard(card)
      jest.spyOn(Math, 'random').mockReturnValue(0.99) // roll = 6
      new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).execute(gs)
      expect(gs.getAbilitiesUsedThisTurn()).toContain('hero-1')
      jest.restoreAllMocks()
    })

    it('should not mark ability used on failure', () => {
      // Force failure by setting rollReq = 7 (impossible)
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 7)
      gs.registerCard(card)
      jest.spyOn(Math, 'random').mockReturnValue(0) // roll = 1
      new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).execute(gs)
      expect(gs.getAbilitiesUsedThisTurn()).not.toContain('hero-1')
      jest.restoreAllMocks()
    })

    it('should include ability events on success', () => {
      const gs = makeGs(['hero-1'])
      const abilityEvent = new GameEvent(
        GameEventType.CardDrawn,
        'p1',
        {},
        Audience.PlayerOnly,
      )
      const task: ITask = { execute: () => [abilityEvent] }
      const ability: IAbility = { steps: [task] }
      const card = makeHeroCard('hero-1', 1, ability)
      gs.registerCard(card)
      jest.spyOn(Math, 'random').mockReturnValue(0.99) // roll = 6
      const events = new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).execute(
        gs,
      )
      expect(events).toContain(abilityEvent)
      jest.restoreAllMocks()
    })

    it('should include Success result on high roll', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 1)
      gs.registerCard(card)
      jest.spyOn(Math, 'random').mockReturnValue(0.99)
      const events = new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).execute(
        gs,
      )
      const diceEvent = events.find(
        (e) => e.getType() === GameEventType.DiceRolled,
      )!
      expect((diceEvent.getPayload() as any).result).toBe(RollResult.Success)
      jest.restoreAllMocks()
    })

    it('should include Failure result on low roll against high rollReq', () => {
      const gs = makeGs(['hero-1'])
      const card = makeHeroCard('hero-1', 6)
      gs.registerCard(card)
      jest.spyOn(Math, 'random').mockReturnValue(0) // roll = 1
      const events = new RollOnHeroAction('p1', 'hero-1', makeAp(gs)).execute(
        gs,
      )
      const diceEvent = events.find(
        (e) => e.getType() === GameEventType.DiceRolled,
      )!
      expect((diceEvent.getPayload() as any).result).toBe(RollResult.Failure)
      jest.restoreAllMocks()
    })
  })
})
