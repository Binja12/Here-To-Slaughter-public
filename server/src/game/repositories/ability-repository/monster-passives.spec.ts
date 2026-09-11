import { CardType, GameEventType, HeroClass, IGameEvent, PassiveType, ReactionWindowType, RollCompareMode, TriggerScope, MonsterCardData } from 'shared'
import { MegaSlimeAbility } from './mega-slime-ability'
import { WarwornOwlbearAbility } from './warworn-owlbear-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { MonsterCard } from '../../cards/monster-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { PlayItemAction } from '../../actions/play-item-action'
import { GameEventFactory } from '../../events/game-event-factory'
import { baseGameCards } from '../../../data/base-game-cards'
import { SacrificeTask } from '../../tasks/hero-tasks'

// ---------------------------------------------------------------------------
// The two monster passives that install on MonsterSlain and never expire.
//
//   monster-123 Mega Slime       +1 action point each of your turns
//   monster-135 Warworn Owlbear  Items you play cannot be challenged
//
// Both are IEffects rather than entries that fire per turn, for the reason in
// section 7: the value has to be found at a moment when no ability is running.
// ---------------------------------------------------------------------------

const AP_PER_TURN = 3

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
    lowerReq: 3,
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
        actionPoints: AP_PER_TURN,
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

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)

  return { gs, em, rm, tm, events }
}

/** Puts the monster in the row, then wins it for `playerId`. */
function slay(
  ctx: ReturnType<typeof setup>,
  monsterId: string,
  playerId: string,
) {
  ctx.gs.registerCard(monster(monsterId))
  ctx.gs.getMonsterPile().add(monsterId)
  ctx.gs.slayMonster(monsterId, playerId, ctx.em)
}

const bonusesOf = (gs: GameState, playerId: string, type: PassiveType) =>
  gs
    .getPlayer(playerId)!
    .getAllEffects()
    .filter((e) => e.type === type)

// ---------------------------------------------------------------------------

describe('monster passives', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // =========================================================================
  // Mega Slime — monster-123
  // =========================================================================

  describe('Mega Slime (monster-123)', () => {
    it('is registered and installs on MonsterSlain', () => {
      expect(abilityRegistry.get('monster-123')).toBe(MegaSlimeAbility)
      expect(MegaSlimeAbility[0].trigger).toEqual({
        on: GameEventType.MonsterSlain,
        scope: TriggerScope.SelfCard,
      })
    })

    it('installs nothing while the monster is still in the row', () => {
      const ctx = setup()
      ctx.gs.registerCard(monster('monster-123'))
      ctx.gs.getMonsterPile().add('monster-123')

      expect(bonusesOf(ctx.gs, 'p1', PassiveType.ActionPointBonus)).toEqual([])
    })

    it('installs a +1 on the slayer when it is won', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      expect(bonusesOf(ctx.gs, 'p1', PassiveType.ActionPointBonus)).toEqual([
        expect.objectContaining({ sourceCardId: 'monster-123', value: 1 }),
      ])
    })

    it('gives the slayer a point on the turn it is won, not only from the next (the owner, 2026-09-04)', () => {
      const ctx = setup()
      const before = ctx.gs.getPlayer('p1')!.getActionPoints()
      slay(ctx, 'monster-123', 'p1')

      expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(before + 1)
      expect(ctx.gs.getPlayer('p2')!.getActionPoints()).toBe(AP_PER_TURN)
    })

    it('installs on the slayer only, not the table', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      expect(bonusesOf(ctx.gs, 'p2', PassiveType.ActionPointBonus)).toEqual([])
    })

    it('gives the owner an extra point at the start of their turn', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      ctx.tm.startTurn('p1')

      expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(AP_PER_TURN + 1)
    })

    it('does nothing for anybody else', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      ctx.tm.startTurn('p2')

      expect(ctx.gs.getPlayer('p2')!.getActionPoints()).toBe(AP_PER_TURN)
    })

    it('applies on EVERY turn, not just the one it was won on', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      const opened: number[] = []
      for (let round = 0; round < 3; round++) {
        ctx.tm.startTurn('p1')
        opened.push(ctx.gs.getPlayer('p1')!.getActionPoints())
        // Spend the whole budget, so a turn that forgot the bonus shows up.
        ctx.gs.getPlayer('p1')!.decreaseActionPoints(AP_PER_TURN + 1)
        ctx.tm.startTurn('p2')
      }

      expect(opened).toEqual([AP_PER_TURN + 1, AP_PER_TURN + 1, AP_PER_TURN + 1])
    })

    it('is applied AFTER the reset, so it never compounds within a turn', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      ctx.tm.startTurn('p1')
      ctx.tm.startTurn('p1')

      expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(AP_PER_TURN + 1)
    })

    it('stacks with a second Mega Slime — each keeps its own source', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')
      // A second copy of the same design would be a second id; reuse the
      // declaration the way the registry does.
      ctx.gs.addEffect({
        id: 'eff-2',
        sourceCardId: 'monster-123-b',
        ownerId: 'p1',
        type: PassiveType.ActionPointBonus,
        value: 1,
      })

      ctx.tm.startTurn('p1')

      expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(AP_PER_TURN + 2)
    })

    it('is permanent — nothing is declared to expire it', () => {
      const ctx = setup()
      slay(ctx, 'monster-123', 'p1')

      ctx.tm.startTurn('p1')
      ctx.tm.endTurn()

      expect(
        bonusesOf(ctx.gs, 'p1', PassiveType.ActionPointBonus)[0].expiry,
      ).toBeUndefined()
      expect(bonusesOf(ctx.gs, 'p1', PassiveType.ActionPointBonus)).toHaveLength(1)
    })
  })

  // =========================================================================
  // Warworn Owlbear — monster-135
  // =========================================================================

  describe('Warworn Owlbear (monster-135)', () => {
    const arm = (ctx: ReturnType<typeof setup>, cursed = false) => {
      ctx.gs.registerCard(
        new HeroCard({
          id: 'hero-1',
          name: 'hero-1',
          type: CardType.Hero,
          image: '',
          description: '',
          set: 'base',
          heroClass: HeroClass.Fighter,
          rollReq: 5,
        }),
      )
      ctx.gs.getParty('p1').addHero('hero-1', ctx.em, 'Played')
      ctx.gs.registerCard(
        new ItemCard({
          id: 'item-1',
          name: 'item-1',
          type: CardType.Item,
          image: '',
          description: '',
          set: 'base',
          cursed,
        }),
      )
      ctx.gs.getPlayer('p1')!.addToHand('item-1')
      ctx.gs.setCurrentPlayerId('p1')
    }

    const challengeWindowOpened = (events: IGameEvent[]) =>
      events
        .map((e) => e.getPayload() as Record<string, unknown>)
        .find((p) => p['windowType'] === ReactionWindowType.Challenge)

    it('is registered and installs on MonsterSlain', () => {
      expect(abilityRegistry.get('monster-135')).toBe(WarwornOwlbearAbility)
      expect(WarwornOwlbearAbility[0].trigger).toEqual({
        on: GameEventType.MonsterSlain,
        scope: TriggerScope.SelfCard,
      })
    })

    it('installs CantBeChallenged naming Items only', () => {
      const ctx = setup()
      slay(ctx, 'monster-135', 'p1')

      expect(bonusesOf(ctx.gs, 'p1', PassiveType.CantBeChallenged)).toEqual([
        expect.objectContaining({
          sourceCardId: 'monster-135',
          cardTypes: [CardType.Item],
        }),
      ])
    })

    // --- the reader ---

    describe('GameState.canBeChallenged', () => {
      it('is true for everything before the monster is won', () => {
        const ctx = setup()
        arm(ctx)
        expect(ctx.gs.canBeChallenged('p1', 'item-1')).toBe(true)
      })

      it('is false for the owner Items once it is won', () => {
        const ctx = setup()
        arm(ctx)
        slay(ctx, 'monster-135', 'p1')
        expect(ctx.gs.canBeChallenged('p1', 'item-1')).toBe(false)
      })

      it('still protects nobody else Items', () => {
        const ctx = setup()
        arm(ctx)
        slay(ctx, 'monster-135', 'p1')
        expect(ctx.gs.canBeChallenged('p2', 'item-1')).toBe(true)
      })

      it('leaves a HERO the owner plays challengeable — Items only', () => {
        const ctx = setup()
        arm(ctx)
        slay(ctx, 'monster-135', 'p1')
        expect(ctx.gs.canBeChallenged('p1', 'hero-1')).toBe(true)
      })
    })

    // --- the effect on a real play ---

    it('an Item played by the owner gets a window nobody has time to answer', () => {
      const ctx = setup()
      arm(ctx)
      slay(ctx, 'monster-135', 'p1')

      new PlayItemAction('a1', 'p1', 'item-1', 'hero-1', ctx.rm, ctx.em).execute(
        ctx.gs,
      )

      expect(challengeWindowOpened(ctx.events)).toMatchObject({
        challengeable: false,
      })

      // Settles on the very next tick rather than the usual five seconds.
      jest.advanceTimersByTime(0)
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })

    it('the item is still equipped — the play stands, it is just uncontested', () => {
      const ctx = setup()
      arm(ctx)
      slay(ctx, 'monster-135', 'p1')

      new PlayItemAction('a1', 'p1', 'item-1', 'hero-1', ctx.rm, ctx.em).execute(
        ctx.gs,
      )
      jest.advanceTimersByTime(0)

      expect(ctx.gs.getEquippedItem('hero-1')).toBe('item-1')
    })

    it('the frame still SETTLES, so the item own entry can fire off it', () => {
      const ctx = setup()
      arm(ctx)
      slay(ctx, 'monster-135', 'p1')

      new PlayItemAction('a1', 'p1', 'item-1', 'hero-1', ctx.rm, ctx.em).execute(
        ctx.gs,
      )
      jest.advanceTimersByTime(0)

      const resolved = ctx.events.filter(
        (e) => e.getType() === GameEventType.FrameResolved,
      )
      expect(
        resolved.some(
          (e) => (e.getPayload() as { cardId?: string }).cardId === 'item-1',
        ),
      ).toBe(true)
    })

    it('without the monster the same play waits the full five seconds', () => {
      const ctx = setup()
      arm(ctx)

      new PlayItemAction('a1', 'p1', 'item-1', 'hero-1', ctx.rm, ctx.em).execute(
        ctx.gs,
      )

      expect(challengeWindowOpened(ctx.events)).toMatchObject({
        challengeable: true,
      })

      jest.advanceTimersByTime(0)
      expect(ctx.gs.hasOpenFrames()).toBe(true)

      jest.advanceTimersByTime(5000)
      expect(ctx.gs.hasOpenFrames()).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Fight back — the attacker pays, and the monster stays in the row
//
// Both entries are scoped Attacker: the monster is still in the pile and
// belongs to nobody, so `ownerFor` reads the owner off the event.
// ---------------------------------------------------------------------------

describe('every printed SACRIFICE fight-back is declared', () => {
  it('has a MonsterFoughtBack entry, scoped Attacker, ending in a sacrifice', () => {
    const sacrificers = baseGameCards.filter(
      (c) => c.type === CardType.Monster && /sacrifice/i.test((c as MonsterCardData).fightBack?.description ?? ''),
    )
    expect(sacrificers.length).toBeGreaterThan(4) // Terratuga, Sabretooth, Serpent, Bloodwing, Mega Slime, ...
    for (const monster of sacrificers) {
      const entry = abilityRegistry.get(monster.id)?.find(
        (rule) => rule.trigger.on === GameEventType.MonsterFoughtBack && rule.trigger.scope === TriggerScope.Attacker,
      )
      expect({ id: monster.id, declared: !!entry }).toEqual({ id: monster.id, declared: true })
      expect(entry!.steps[entry!.steps.length - 1]).toBeInstanceOf(SacrificeTask)
    }
  })
})

describe('monster fight-back', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  /** Puts the monster in the row and fires a fight-back against `playerId`. */
  const foughtBack = (
    ctx: ReturnType<typeof setup>,
    monsterId: string,
    playerId: string,
  ) => {
    ctx.gs.registerCard(monster(monsterId))
    ctx.gs.getMonsterPile().add(monsterId)
    ctx.em.emit(GameEventFactory.monsterFoughtBack(playerId, monsterId))
  }

  const openChoice = (gs: GameState) =>
    gs.getFrameByWindowType(ReactionWindowType.CardChoice)?.frame.windows[0]

  const optionsOffered = (events: IGameEvent[]) =>
    events
      .map((e) => e.getPayload() as Record<string, unknown>)
      .find((p) => p['windowType'] === ReactionWindowType.CardChoice)

  const handOf = (ctx: ReturnType<typeof setup>, cards: string[]) => {
    for (const id of cards) {
      ctx.gs.registerCard(
        new ItemCard({
          id,
          name: id,
          type: CardType.Item,
          image: '',
          description: '',
          set: 'base',
          cursed: false,
        }),
      )
      ctx.gs.getPlayer('p1')!.addToHand(id)
    }
  }

  // =========================================================================
  // Warworn Owlbear — discard two cards
  // =========================================================================

  describe('Warworn Owlbear (monster-135) — discard two cards', () => {
    it('declares the fight-back on MonsterFoughtBack, scoped Attacker', () => {
      expect(WarwornOwlbearAbility[1].trigger).toEqual({
        on: GameEventType.MonsterFoughtBack,
        scope: TriggerScope.Attacker,
      })
    })

    it('asks the ATTACKER to pick from their own hand', () => {
      const ctx = setup()
      handOf(ctx, ['card-a', 'card-b', 'card-c'])

      foughtBack(ctx, 'monster-135', 'p1')

      expect(optionsOffered(ctx.events)!['options']).toEqual([
        'card-a',
        'card-b',
        'card-c',
      ])
      expect(optionsOffered(ctx.events)!['respondentId']).toBe('p1')
    })

    it('takes TWO cards, one choice at a time', () => {
      const ctx = setup()
      handOf(ctx, ['card-a', 'card-b', 'card-c'])

      foughtBack(ctx, 'monster-135', 'p1')
      openChoice(ctx.gs)!.submitReaction('p1', { choice: 'card-a' })
      openChoice(ctx.gs)!.submitReaction('p1', { choice: 'card-b' })

      expect(ctx.gs.getPlayer('p1')!.getHand()).toEqual(['card-c'])
      expect(ctx.gs.getDiscardPile().getAll().sort()).toEqual([
        'card-a',
        'card-b',
      ])
    })

    it('an idle attacker still pays — a cost cannot be dodged by waiting', () => {
      const ctx = setup()
      handOf(ctx, ['card-a', 'card-b', 'card-c'])

      foughtBack(ctx, 'monster-135', 'p1')
      jest.advanceTimersByTime(5000)
      jest.advanceTimersByTime(5000)

      expect(ctx.gs.getPlayer('p1')!.getHand()).toHaveLength(1)
      expect(ctx.gs.getDiscardPile().getSize()).toBe(2)
    })

    it('takes what there is when the hand is short', () => {
      const ctx = setup()
      handOf(ctx, ['card-a'])

      foughtBack(ctx, 'monster-135', 'p1')
      openChoice(ctx.gs)!.submitReaction('p1', { choice: 'card-a' })
      jest.advanceTimersByTime(0)

      expect(ctx.gs.getPlayer('p1')!.getHand()).toEqual([])
      expect(ctx.gs.getDiscardPile().getAll()).toEqual(['card-a'])
    })

    it('an empty hand costs nothing and stalls nothing', () => {
      const ctx = setup()

      foughtBack(ctx, 'monster-135', 'p1')
      // Each empty choice settles on its own 0ms timer, and the SECOND is
      // scheduled from inside the first one's callback — jest will not run a
      // nested 0ms timer without the clock actually moving.
      jest.advanceTimersByTime(1)
      jest.advanceTimersByTime(1)

      expect(ctx.gs.getDiscardPile().getSize()).toBe(0)
      expect(ctx.gs.hasOpenFrames()).toBe(false)
      expect(ctx.gs.getPipelines()).toHaveLength(0)
    })

    it('leaves the monster in the row — it was not won', () => {
      const ctx = setup()
      handOf(ctx, ['card-a', 'card-b'])

      foughtBack(ctx, 'monster-135', 'p1')

      expect(ctx.gs.getMonsterPile().getAll()).toContain('monster-135')
      expect(ctx.gs.getParty('p1').getMonsterIds()).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Mega Slime fight-back — sacrifice one of your heroes
// ---------------------------------------------------------------------------

describe('Mega Slime (monster-123) — fight back sacrifices a hero', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const foughtBack = (ctx: ReturnType<typeof setup>, playerId: string) => {
    ctx.gs.registerCard(monster('monster-123'))
    ctx.gs.getMonsterPile().add('monster-123')
    ctx.em.emit(GameEventFactory.monsterFoughtBack(playerId, 'monster-123'))
  }

  const openChoice = (gs: GameState) =>
    gs.getFrameByWindowType(ReactionWindowType.CardChoice)?.frame.windows[0]

  const withHeroes = (ctx: ReturnType<typeof setup>, ids: string[]) => {
    for (const id of ids) {
      ctx.gs.registerCard(
        new HeroCard({
          id,
          name: id,
          type: CardType.Hero,
          image: '',
          description: '',
          set: 'base',
          heroClass: HeroClass.Fighter,
          rollReq: 5,
        }),
      )
      ctx.gs.getParty('p1').addHero(id, ctx.em, 'Played')
    }
  }

  it('declares the fight-back on MonsterFoughtBack, scoped Attacker', () => {
    expect(MegaSlimeAbility[1].trigger).toEqual({
      on: GameEventType.MonsterFoughtBack,
      scope: TriggerScope.Attacker,
    })
  })

  it('offers the ATTACKER their own party', () => {
    const ctx = setup()
    withHeroes(ctx, ['hero-a', 'hero-b'])

    foughtBack(ctx, 'p1')

    const opened = ctx.events
      .map((e) => e.getPayload() as Record<string, unknown>)
      .find((p) => p['windowType'] === ReactionWindowType.CardChoice)
    expect(opened!['options']).toEqual(['hero-a', 'hero-b'])
    expect(opened!['respondentId']).toBe('p1')
  })

  it('takes the hero out of the party and into the discard', () => {
    const ctx = setup()
    withHeroes(ctx, ['hero-a', 'hero-b'])

    foughtBack(ctx, 'p1')
    openChoice(ctx.gs)!.submitReaction('p1', { choice: 'hero-a' })

    expect(ctx.gs.getParty('p1').getHeroIds()).toEqual(['hero-b'])
    expect(ctx.gs.getDiscardPile().getAll()).toContain('hero-a')
  })

  it('announces a SACRIFICE, not a destroy, alongside the canonical removal', () => {
    const ctx = setup()
    withHeroes(ctx, ['hero-a'])

    foughtBack(ctx, 'p1')
    openChoice(ctx.gs)!.submitReaction('p1', { choice: 'hero-a' })

    const types = ctx.events.map((e) => e.getType())
    expect(types).toContain(GameEventType.HeroSacrificed)
    expect(types).not.toContain(GameEventType.HeroDestroyed)
    expect(types).toContain(GameEventType.HeroRemovedFromParty)
  })

  it('an empty party costs nothing and stalls nothing', () => {
    const ctx = setup()

    foughtBack(ctx, 'p1')
    jest.advanceTimersByTime(1)

    expect(ctx.gs.getDiscardPile().getSize()).toBe(0)
    expect(ctx.gs.hasOpenFrames()).toBe(false)
    expect(ctx.gs.getPipelines()).toHaveLength(0)
  })

  it('hits the attacker, not the other seat', () => {
    const ctx = setup()
    withHeroes(ctx, ['hero-a'])
    ctx.gs.registerCard(
      new HeroCard({
        id: 'p2-hero',
        name: 'p2-hero',
        type: CardType.Hero,
        image: '',
        description: '',
        set: 'base',
        heroClass: HeroClass.Fighter,
        rollReq: 5,
      }),
    )
    ctx.gs.getParty('p2').addHero('p2-hero', ctx.em, 'Played')

    foughtBack(ctx, 'p1')
    jest.advanceTimersByTime(5000)

    expect(ctx.gs.getParty('p2').getHeroIds()).toEqual(['p2-hero'])
    expect(ctx.gs.getParty('p1').getHeroIds()).toEqual([])
  })

  it('leaves the monster in the row — it was not won', () => {
    const ctx = setup()
    withHeroes(ctx, ['hero-a'])

    foughtBack(ctx, 'p1')

    expect(ctx.gs.getMonsterPile().getAll()).toContain('monster-123')
    expect(ctx.gs.getParty('p1').getMonsterIds()).toEqual([])
  })
})
