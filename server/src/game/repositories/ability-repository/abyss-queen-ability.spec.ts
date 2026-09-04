import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
  ReactionWindowType,
  RollCompareMode,
  TriggerScope,
} from 'shared'
import { AbyssQueenAbility } from './abyss-queen-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { MonsterCard } from '../../cards/monster-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { GameEventFactory } from '../../events/game-event-factory'
import { ModifierWindow } from '../../reactions/modifier-window'
import { ChallengeWindow } from '../../reactions/challenge-window'

// ---------------------------------------------------------------------------
// Abyss Queen (monster-129): "Each time another player plays a Modifier card on
// one of your rolls, +1 to your roll."
//
// An IEffect, not an entry triggered on ModifierPlayed: the +1 has to land in a
// window that is already open, and no pipeline is running at the moment a bonus
// arrives (section 7). The windows read it; "another player" is their own
// playerId check, because a trigger scope could not say it.
// ---------------------------------------------------------------------------

const QUEEN = 'monster-129'

const monster = (id: string) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'base',
    partyReq: { classes: [] },
    higherReq: 8,
    lowerReq: 5,
    rollCompareMode: RollCompareMode.HighToWin,
  })

function setup() {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const playerId of ['p1', 'p2']) {
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
        heroIds: [],
        monsterIds: [],
      }),
    )
  }

  gs.registerCard(
    new HeroCard({
      id: 'hero-1',
      name: 'hero-1',
      type: CardType.Hero,
      image: '',
      description: '',
      set: 'base',
      heroClass: HeroClass.Bard,
      rollReq: 5,
    }),
  )

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)

  return { gs, em, rm, events }
}

/** Wins the Queen for `playerId`, installing the standing answer. */
function crown(ctx: ReturnType<typeof setup>, playerId: string) {
  ctx.gs.registerCard(monster(QUEEN))
  ctx.gs.getMonsterPile().add(QUEEN)
  ctx.gs.slayMonster(QUEEN, playerId, ctx.em)
}

/** A plain roll on a hero belonging to `rollerId`. */
function rollWindow(ctx: ReturnType<typeof setup>, rollerId: string) {
  const win = new ModifierWindow(
    'win-1',
    rollerId,
    5,
    8,
    'hero-1',
    5000,
    ctx.gs,
    'frame-1',
    ctx.em,
  )
  ctx.gs.addFrame('frame-1', ctx.gs.clone(), [win])
  return win
}

// ---------------------------------------------------------------------------

describe('Abyss Queen (monster-129)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // --- Installation ---

  it('is registered and installs on MonsterSlain', () => {
    expect(abilityRegistry.get(QUEEN)).toBe(AbyssQueenAbility)
    expect(AbyssQueenAbility[0].trigger).toEqual({
      on: GameEventType.MonsterSlain,
      scope: TriggerScope.SelfCard,
    })
  })

  it('installs a +1 ModifierCounterBonus on the slayer', () => {
    const ctx = setup()
    crown(ctx, 'p1')

    expect(
      ctx.gs.getEffects(PassiveType.ModifierCounterBonus, 'p1'),
    ).toEqual([expect.objectContaining({ sourceCardId: QUEEN, value: 1 })])
    expect(ctx.gs.getEffects(PassiveType.ModifierCounterBonus, 'p2')).toEqual([])
  })

  it('installs nothing while it is still in the row', () => {
    const ctx = setup()
    ctx.gs.registerCard(monster(QUEEN))
    ctx.gs.getMonsterPile().add(QUEEN)

    expect(ctx.gs.getEffects(PassiveType.ModifierCounterBonus, 'p1')).toEqual([])
  })

  // --- On a plain roll ---

  describe('on one of the owner rolls', () => {
    it('answers ANOTHER player modifier with +1', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      const win = rollWindow(ctx, 'p1')

      // p2 tries to sink p1's roll by 3.
      win.submitReaction('p2', { value: -3, cardId: 'modifier-1' })

      // 5 - 3 + 1 = 3, not 2.
      expect(win.getFinalRoll()).toBe(3)
    })

    it('names the Queen as the source, so the roll UI can show it', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      const win = rollWindow(ctx, 'p1')

      win.submitReaction('p2', { value: -3, cardId: 'modifier-1' })

      const applied = ctx.events.filter(
        (e) => e.getType() === GameEventType.ModifierApplied,
      )
      // The announced finalRoll already counts the answer.
      expect(applied[applied.length - 1].getPayload()).toMatchObject({
        finalRoll: 3,
      })
    })

    it('does NOT answer the owner own modifier', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      const win = rollWindow(ctx, 'p1')

      win.submitReaction('p1', { value: 2, cardId: 'modifier-1' })

      expect(win.getFinalRoll()).toBe(7) // 5 + 2, no extra
    })

    it('answers EACH hostile modifier, not just the first', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      const win = rollWindow(ctx, 'p1')

      win.submitReaction('p2', { value: -1, cardId: 'modifier-1' })
      win.submitReaction('p2', { value: -1, cardId: 'modifier-2' })

      // 5 - 1 + 1 - 1 + 1 = 5.
      expect(win.getFinalRoll()).toBe(5)
    })

    it('does nothing on a roll that is not the owner', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      const win = rollWindow(ctx, 'p2')

      win.submitReaction('p2', { value: -3, cardId: 'modifier-1' })

      expect(win.getFinalRoll()).toBe(2) // 5 - 3, the Queen is not p2's
    })

    it('does nothing at all before the Queen is won', () => {
      const ctx = setup()
      const win = rollWindow(ctx, 'p1')

      win.submitReaction('p2', { value: -3, cardId: 'modifier-1' })

      expect(win.getFinalRoll()).toBe(2)
    })
  })

  // --- On a challenge, which has two rolls ---

  describe('on a challenge', () => {
    const challenge = (ctx: ReturnType<typeof setup>) => {
      const win = new ChallengeWindow(
        'win-c',
        'p1', // defender
        'card-1',
        5000,
        ctx.gs,
        'frame-c',
        ctx.em,
      )
      ctx.gs.addFrame('frame-c', ctx.gs.clone(), [win])
      win.submitReaction('p2', { type: 'challenge', challengerId: 'p2' })
      return win
    }

    const finals = (events: IGameEvent[]) => {
      const applied = events.filter(
        (e) => e.getType() === GameEventType.ModifierApplied,
      )
      return applied[applied.length - 1].getPayload() as {
        challengerTotal: number
        defenderTotal: number
      }
    }

    it('answers on the side the hostile modifier was aimed at', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      jest.spyOn(Math, 'random').mockReturnValue(0.5) // both rolls equal
      const win = challenge(ctx)
      ctx.events.length = 0

      // p2 sinks the DEFENDER's roll — p1 is the defender and holds the Queen.
      win.submitReaction('p2', {
        type: 'modifier',
        value: -4,
        cardId: 'modifier-1',
        targetPlayerId: 'p1',
      })

      const { defenderTotal } = finals(ctx.events)
      // -4 then +1 back.
      expect(defenderTotal).toBe(6 - 4 + 1)
    })

    it('does not answer a modifier the owner aimed at themselves', () => {
      const ctx = setup()
      crown(ctx, 'p1')
      jest.spyOn(Math, 'random').mockReturnValue(0.5)
      const win = challenge(ctx)
      ctx.events.length = 0

      win.submitReaction('p1', {
        type: 'modifier',
        value: 2,
        cardId: 'modifier-1',
        targetPlayerId: 'p1',
      })

      const { defenderTotal } = finals(ctx.events)
      expect(defenderTotal).toBe(6 + 2)
    })
  })

  // --- Fight back ---

  it('fights back by SACRIFICING one of the attacker heroes', () => {
    const ctx = setup()
    expect(AbyssQueenAbility[1].trigger).toEqual({
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    })

    ctx.gs.getParty('p1').addHero('hero-1', ctx.em, 'Played')
    ctx.gs.registerCard(monster(QUEEN))
    ctx.gs.getMonsterPile().add(QUEEN)

    ctx.em.emit(GameEventFactory.monsterFoughtBack('p1', QUEEN))
    ctx.gs
      .getFrameByWindowType(ReactionWindowType.CardChoice)!
      .frame.windows[0].submitReaction('p1', { choice: 'hero-1' })

    expect(ctx.gs.getParty('p1').getHeroIds()).toEqual([])
    expect(ctx.gs.getDiscardPile().getAll()).toContain('hero-1')
    expect(ctx.events.map((e) => e.getType())).toContain(
      GameEventType.HeroSacrificed,
    )
  })
})
