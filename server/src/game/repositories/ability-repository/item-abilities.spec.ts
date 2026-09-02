import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  PassiveType,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { CurseOfTheSnakesEyesAbility } from './curse-of-the-snakes-eyes-ability'
import { ParticularlyRustyCoinAbility } from './particularly-rusty-coin-ability'
import { SealingKeyAbility } from './sealing-key-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { PlayItemAction } from '../../actions/play-item-action'
import { RollOnHeroAction } from '../../actions/roll-on-hero-action'
import { StealFromPartyTask, DestroyTask } from '../../tasks/hero-tasks'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
} from '../../abilities/ability-context'

// ---------------------------------------------------------------------------
// Three item cards, three different shapes.
//
//   item-062/063 Particularly Rusty Coin   DRAW on a FAILED roll
//   item-074/075 Curse of the Snake's Eyes -2 to the carrier's rolls
//   item-076     Sealing Key               the carrier cannot roll at all
//
// The two that leave an EFFECT behind install on ItemEquippedToHero and expire
// on ItemUnequipped — the same pair of events the item's position changes on.
// That symmetry is what carries an effect across a steal, and a defeated play
// is undone by the frame rollback rather than by never having installed.
// ---------------------------------------------------------------------------

const ROLL_REQ = 6
const LOW = 0 // baseRoll 1
const HIGH = 0.99 // baseRoll 12

const hero = (id: string) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'base',
    heroClass: HeroClass.Fighter,
    rollReq: ROLL_REQ,
  })

const itemCard = (id: string, cursed: boolean) =>
  new ItemCard({
    id,
    name: id,
    type: CardType.Item,
    image: '',
    description: '',
    set: 'base',
    cursed,
  })

/** p1 holds the item; p1 and p2 each field one hero. */
function setup(itemId: string, cursed: boolean) {
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
        actionPoints: 5,
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
    gs.registerCard(hero(`${playerId}-hero`))
  }

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)

  gs.getParty('p1').addHero('p1-hero', em, 'Played')
  gs.getParty('p2').addHero('p2-hero', em, 'Played')
  gs.registerCard(itemCard(itemId, cursed))
  gs.getPlayer('p1')!.addToHand(itemId)
  gs.setCurrentPlayerId('p1')

  return { gs, em, rm, tm, events }
}

/** Plays the item onto `heroId` and lets the challenge lapse, so it installs. */
function equip(
  ctx: ReturnType<typeof setup>,
  itemId: string,
  heroId: string,
) {
  new PlayItemAction('a1', 'p1', itemId, heroId, ctx.rm, ctx.em).execute(ctx.gs)
  jest.advanceTimersByTime(5000)
}

/** Rolls on `heroId` for `playerId` and lets the modifier window lapse. */
function roll(
  ctx: ReturnType<typeof setup>,
  playerId: string,
  heroId: string,
  random: number,
) {
  jest.spyOn(Math, 'random').mockReturnValue(random)
  new RollOnHeroAction('a2', playerId, heroId, ctx.em, ctx.rm).execute(ctx.gs)
  jest.advanceTimersByTime(5000)
}

/**
 * The last modifier window to OPEN. The event type filter matters:
 * ReactionWindowClosed carries the same `windowType`, and its payload has no
 * `bonuses` — matching on windowType alone silently reads the wrong event.
 */
const openedRoll = (events: IGameEvent[]) => {
  const opened = events
    .filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
    .map((e) => e.getPayload() as Record<string, unknown>)
    .filter((p) => p['windowType'] === ReactionWindowType.Modifier)
  return opened[opened.length - 1]
}

const effectsOf = (gs: GameState, playerId: string, type: PassiveType) =>
  gs
    .getPlayer(playerId)!
    .getAllEffects()
    .filter((e) => e.type === type)

// ---------------------------------------------------------------------------

describe('item abilities', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // =========================================================================
  // Curse of the Snake's Eyes — item-074 / item-075
  // =========================================================================

  describe("Curse of the Snake's Eyes (item-074, item-075)", () => {
    it('is registered for BOTH printed copies, sharing one declaration', () => {
      expect(abilityRegistry.get('item-074')).toBe(CurseOfTheSnakesEyesAbility)
      expect(abilityRegistry.get('item-075')).toBe(CurseOfTheSnakesEyesAbility)
    })

    it('installs on the EQUIP, like every other item that leaves an effect', () => {
      expect(CurseOfTheSnakesEyesAbility[0].trigger).toEqual({
        on: GameEventType.ItemEquippedToHero,
        scope: TriggerScope.SelfCard,
      })
    })

    it('installs a -2 scoped to the hero it rides', () => {
      const ctx = setup('item-074', true)
      equip(ctx, 'item-074', 'p2-hero')

      expect(effectsOf(ctx.gs, 'p2', PassiveType.RollBonus)).toEqual([
        expect.objectContaining({
          sourceCardId: 'item-074',
          value: -2,
          cardId: 'p2-hero',
        }),
      ])
    })

    it('drags the carrier roll down by two', () => {
      const ctx = setup('item-074', true)
      equip(ctx, 'item-074', 'p2-hero')
      ctx.events.length = 0

      roll(ctx, 'p2', 'p2-hero', HIGH) // baseRoll 12

      expect(openedRoll(ctx.events)).toMatchObject({
        bonuses: [{ cardSource: 'item-074', amount: -2 }],
        finalRoll: 10,
      })
    })

    it('leaves the OTHER party heroes alone — it is scoped to its carrier', () => {
      const ctx = setup('item-074', true)
      equip(ctx, 'item-074', 'p2-hero')
      ctx.events.length = 0

      roll(ctx, 'p1', 'p1-hero', HIGH)

      expect(openedRoll(ctx.events)).toMatchObject({ finalRoll: 12 })
    })

    it('goes when the item comes off', () => {
      const ctx = setup('item-074', true)
      equip(ctx, 'item-074', 'p2-hero')

      ctx.gs.getParty('p2').unequipItem('p2-hero')
      ctx.em.emit({
        getType: () => GameEventType.ItemUnequipped,
        getPlayerId: () => 'p2',
        getPayload: () => ({ cardId: 'item-074', heroId: 'p2-hero' }),
        getAudience: () => undefined,
      } as unknown as IGameEvent)

      expect(effectsOf(ctx.gs, 'p2', PassiveType.RollBonus)).toEqual([])
    })
  })

  // =========================================================================
  // Particularly Rusty Coin — item-062 / item-063
  // =========================================================================

  describe('Particularly Rusty Coin (item-062, item-063)', () => {
    it('is registered for BOTH printed copies, sharing one declaration', () => {
      expect(abilityRegistry.get('item-062')).toBe(ParticularlyRustyCoinAbility)
      expect(abilityRegistry.get('item-063')).toBe(ParticularlyRustyCoinAbility)
    })

    it('waits on the CARRIER failing, not on its own card', () => {
      expect(ParticularlyRustyCoinAbility[0].trigger).toEqual({
        on: GameEventType.RollFailed,
        scope: TriggerScope.CarrierCard,
      })
    })

    it('draws a card when the carrier roll comes up short', () => {
      const ctx = setup('item-062', false)
      ctx.gs.getMainDeck().addToTop('reward-1')
      equip(ctx, 'item-062', 'p1-hero')

      roll(ctx, 'p1', 'p1-hero', LOW) // 1 < 6

      expect(ctx.gs.getPlayer('p1')!.getHand()).toContain('reward-1')
    })

    it('draws NOTHING when the roll succeeds', () => {
      const ctx = setup('item-062', false)
      ctx.gs.getMainDeck().addToTop('reward-1')
      equip(ctx, 'item-062', 'p1-hero')

      roll(ctx, 'p1', 'p1-hero', HIGH) // 12 >= 6

      expect(ctx.gs.getPlayer('p1')!.getHand()).not.toContain('reward-1')
    })

    it('KEEPS the drawn card — the reward outlives the rollback', () => {
      const ctx = setup('item-062', false)
      ctx.gs.getMainDeck().addToTop('reward-1')
      equip(ctx, 'item-062', 'p1-hero')

      roll(ctx, 'p1', 'p1-hero', LOW)

      // The failed roll restored its frame; the draw happened after, on live
      // state, so it is not undone with it.
      expect(ctx.gs.getPlayer('p1')!.getHand()).toContain('reward-1')
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })

    it('does nothing for a failed roll on a hero it is not riding', () => {
      const ctx = setup('item-062', false)
      ctx.gs.getMainDeck().addToTop('reward-1')
      equip(ctx, 'item-062', 'p1-hero')

      // p1 has only one hero here, so use p2's failed roll: the coin must not
      // pay out on a roll it has nothing to do with.
      roll(ctx, 'p2', 'p2-hero', LOW)

      expect(ctx.gs.getPlayer('p1')!.getHand()).not.toContain('reward-1')
      expect(ctx.gs.getPlayer('p2')!.getHand()).not.toContain('reward-1')
    })
  })

  // =========================================================================
  // Sealing Key — item-076
  // =========================================================================

  describe('Sealing Key (item-076)', () => {
    it('is registered and installs on the EQUIP', () => {
      expect(abilityRegistry.get('item-076')).toBe(SealingKeyAbility)
      expect(SealingKeyAbility[0].trigger).toEqual({
        on: GameEventType.ItemEquippedToHero,
        scope: TriggerScope.SelfCard,
      })
    })

    it('installs the seal scoped to the hero it rides', () => {
      const ctx = setup('item-076', true)
      equip(ctx, 'item-076', 'p2-hero')

      expect(effectsOf(ctx.gs, 'p2', PassiveType.CantUseHeroEffect)).toEqual([
        expect.objectContaining({ sourceCardId: 'item-076', cardId: 'p2-hero' }),
      ])
    })

    it('makes canUseHeroEffect false for that hero and true for others', () => {
      const ctx = setup('item-076', true)
      equip(ctx, 'item-076', 'p2-hero')

      expect(ctx.gs.canUseHeroEffect('p2', 'p2-hero')).toBe(false)
      expect(ctx.gs.canUseHeroEffect('p1', 'p1-hero')).toBe(true)
    })

    it('refuses the roll ACTION before a point is spent', () => {
      const ctx = setup('item-076', true)
      equip(ctx, 'item-076', 'p2-hero')
      ctx.gs.setCurrentPlayerId('p2')

      const action = new RollOnHeroAction('a2', 'p2', 'p2-hero', ctx.em, ctx.rm)

      expect(action.canExecute(ctx.gs)).toBe(false)
      expect(ctx.gs.getPlayer('p2')!.getActionPoints()).toBe(5)
    })

    it('throws no dice when the request goes through the queue', () => {
      const ctx = setup('item-076', true)
      equip(ctx, 'item-076', 'p2-hero')
      ctx.tm.startTurn('p2')
      ctx.events.length = 0

      // Enqueued, not executed directly: canExecute is where the seal is read,
      // and TurnManager is what consults it. An action reached past its own
      // guard is an engine mistake, the same contract playItem documents.
      jest.spyOn(Math, 'random').mockReturnValue(HIGH)
      ctx.tm.enqueue(new RollOnHeroAction('a2', 'p2', 'p2-hero', ctx.em, ctx.rm))

      expect(
        ctx.events.some((e) => e.getType() === GameEventType.DiceRolled),
      ).toBe(false)
      expect(ctx.gs.hasOpenFrames()).toBe(false)
      expect(ctx.gs.getPlayer('p2')!.getActionPoints()).toBe(5)
    })

    it('leaves the sealed player OTHER heroes rollable', () => {
      const ctx = setup('item-076', true)
      ctx.gs.registerCard(hero('p2-hero-b'))
      ctx.gs.getParty('p2').addHero('p2-hero-b', ctx.em, 'Played')
      equip(ctx, 'item-076', 'p2-hero')
      ctx.gs.setCurrentPlayerId('p2')

      const action = new RollOnHeroAction('a2', 'p2', 'p2-hero-b', ctx.em, ctx.rm)

      expect(action.canExecute(ctx.gs)).toBe(true)
    })

    it('lifts when the key comes off', () => {
      const ctx = setup('item-076', true)
      equip(ctx, 'item-076', 'p2-hero')

      ctx.gs.getParty('p2').unequipItem('p2-hero')
      ctx.em.emit({
        getType: () => GameEventType.ItemUnequipped,
        getPlayerId: () => 'p2',
        getPayload: () => ({ cardId: 'item-076', heroId: 'p2-hero' }),
        getAudience: () => undefined,
      } as unknown as IGameEvent)

      expect(ctx.gs.canUseHeroEffect('p2', 'p2-hero')).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// A stolen hero carries its gear AND what the gear installed
//
// The steal is unequip -> move -> re-equip, and each half announces. The
// unequip retires the effect from the old owner, the re-equip installs it on
// the new one, and the item never leaves the hero.
// ---------------------------------------------------------------------------

describe('an item effect follows its carrier across a steal', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  /** p1 curses p2's hero, then p3 steals that hero. */
  const stealFrom = (ctx: ReturnType<typeof setup>, heroId: string) => {
    const c = new AbilityContext('thief-card', 'p3')
    c.set(CTX_CHOSEN_CARD, [heroId])
    new StealFromPartyTask().execute(ctx.gs, c, ctx.em, ctx.rm)
  }

  const seat3 = (ctx: ReturnType<typeof setup>) => {
    ctx.gs.registerPlayer(
      new Player({
        id: 'p3',
        name: 'p3',
        hand: [],
        partyId: 'p3-party',
        actionPoints: 5,
      }),
    )
    ctx.gs.registerParty(
      new Party({
        playerId: 'p3',
        leaderId: 'p3-leader',
        heroIds: [],
        monsterIds: [],
      }),
    )
  }

  it('keeps the item on the hero', () => {
    const ctx = setup('item-074', true)
    seat3(ctx)
    equip(ctx, 'item-074', 'p2-hero')

    stealFrom(ctx, 'p2-hero')

    expect(ctx.gs.getParty('p3').getHeroIds()).toEqual(['p2-hero'])
    expect(ctx.gs.getEquippedItem('p2-hero')).toBe('item-074')
  })

  it('moves the -2 onto the THIEF, who now rolls with it', () => {
    const ctx = setup('item-074', true)
    seat3(ctx)
    equip(ctx, 'item-074', 'p2-hero')

    stealFrom(ctx, 'p2-hero')

    expect(effectsOf(ctx.gs, 'p2', PassiveType.RollBonus)).toEqual([])
    expect(effectsOf(ctx.gs, 'p3', PassiveType.RollBonus)).toEqual([
      expect.objectContaining({
        sourceCardId: 'item-074',
        value: -2,
        cardId: 'p2-hero',
      }),
    ])
  })

  it('lands on the thief roll, not the victim', () => {
    const ctx = setup('item-074', true)
    seat3(ctx)
    equip(ctx, 'item-074', 'p2-hero')
    stealFrom(ctx, 'p2-hero')
    ctx.events.length = 0

    roll(ctx, 'p3', 'p2-hero', HIGH) // baseRoll 12

    expect(openedRoll(ctx.events)).toMatchObject({
      bonuses: [{ cardSource: 'item-074', amount: -2 }],
      finalRoll: 10,
    })
  })

  it('a stolen SEAL still seals — stealing is no longer a free unlock', () => {
    const ctx = setup('item-076', true)
    seat3(ctx)
    equip(ctx, 'item-076', 'p2-hero')

    stealFrom(ctx, 'p2-hero')

    expect(ctx.gs.canUseHeroEffect('p3', 'p2-hero')).toBe(false)
  })

  it('installs exactly once — the move does not stack a second copy', () => {
    const ctx = setup('item-074', true)
    seat3(ctx)
    equip(ctx, 'item-074', 'p2-hero')

    stealFrom(ctx, 'p2-hero')

    expect(effectsOf(ctx.gs, 'p3', PassiveType.RollBonus)).toHaveLength(1)
  })

  it('a hero DESTROYED still loses the effect — the gear goes to the discard', () => {
    const ctx = setup('item-074', true)
    equip(ctx, 'item-074', 'p2-hero')

    const c = new AbilityContext('killer', 'p1')
    c.set(CTX_CHOSEN_CARD, ['p2-hero'])
    new DestroyTask().execute(ctx.gs, c, ctx.em, ctx.rm)

    expect(effectsOf(ctx.gs, 'p2', PassiveType.RollBonus)).toEqual([])
    expect(ctx.gs.getDiscardPile().getAll()).toEqual(
      expect.arrayContaining(['p2-hero', 'item-074']),
    )
  })
})
