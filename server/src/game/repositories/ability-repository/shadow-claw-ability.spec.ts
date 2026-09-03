import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
} from 'shared'
import { ShadowClawAbility } from './shadow-claw-ability'
import { abilityRegistry } from './index'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { MagicCard } from '../../cards/magic-card'
import { PartyLeaderCard } from '../../cards/party-leader-card'
import { IReactionWindow } from '../../interfaces'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { TurnManager } from '../../pipelines/turn-manager'
import { GameEngine } from '../../game-engine'
import { RollOnLeaderAction } from '../../actions/roll-on-leader-action'

// ---------------------------------------------------------------------------
// The Shadow Claw (leader-117) — the one ACTIVATED card, end to end.
//
//   spend a point -> RollSuccess on the leader -> whose hand? -> pull one
// ---------------------------------------------------------------------------

const CLAW = 'leader-117'

const makeMagic = (id: string) =>
  new MagicCard({
    id,
    name: id,
    type: CardType.Magic,
    image: '',
    description: '',
    set: 'base',
  })

function setup(p2Hand: string[] = ['a'], p3Hand: string[] = []) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  for (const [id, hand] of [
    ['p1', []],
    ['p2', p2Hand],
    ['p3', p3Hand],
  ] as const) {
    gs.registerPlayer(
      new Player({
        id,
        name: id,
        hand: [...hand],
        partyId: id + '-party',
        actionPoints: 3,
      }),
    )
    gs.registerParty(
      new Party({
        playerId: id,
        leaderId: id === 'p1' ? CLAW : id + '-leader',
        heroIds: [],
        monsterIds: [],
      }),
    )
  }
  gs.registerCard(
    new PartyLeaderCard({
      id: CLAW,
      name: CLAW,
      type: CardType.Leader,
      image: '',
      description: '',
      set: 'base',
      heroClass: HeroClass.Thief,
    }),
  )
  for (const id of [...p2Hand, ...p3Hand]) gs.registerCard(makeMagic(id))

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManager(gs, em)
  const tm = new TurnManager(gs, em)
  new TaskManager(gs, em, rm, abilityRegistry)
  const engine = new GameEngine(gs, tm, em, [])
  engine.start(['p1', 'p2', 'p3'])

  return { gs, em, rm, tm, events }
}

const playerChoice = (gs: GameState): IReactionWindow | undefined =>
  gs
    .getFrameByWindowType(ReactionWindowType.PlayerChoice)
    ?.frame.windows.find((w) => w.getType() === ReactionWindowType.PlayerChoice)

const activate = (ctx: ReturnType<typeof setup>) =>
  ctx.tm.enqueue(new RollOnLeaderAction('a1', 'p1', CLAW, ctx.em))

describe('ShadowClawAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is registered against the leader card id', () => {
    expect(abilityRegistry.get(CLAW)).toBe(ShadowClawAbility)
  })

  it('rides the activation, not a played card', () => {
    expect(ShadowClawAbility).toHaveLength(1)
    expect(ShadowClawAbility[0].trigger.on).toBe(GameEventType.RollSuccess)
  })

  it('asks whose hand, offering only the opponents', () => {
    const ctx = setup()
    activate(ctx)

    const opened = ctx.events
      .filter((e) => e.getType() === GameEventType.ReactionWindowOpened)
      .map((e) => e.getPayload() as Record<string, unknown>)
      .find((p) => p['windowType'] === ReactionWindowType.PlayerChoice)
    expect(opened?.['options']).toEqual(['p2', 'p3'])
    expect(opened?.['respondentId']).toBe('p1')
  })

  it('pulls a card out of the chosen hand', () => {
    const ctx = setup(['a'])
    activate(ctx)

    playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })

    expect(ctx.gs.getPlayer('p2')!.getHand()).toEqual([])
    expect(ctx.gs.getPlayer('p1')!.getHand()).toEqual(['a'])
  })

  it('takes a RANDOM one — the hand is not visible', () => {
    const ctx = setup(['a', 'b', 'c'])
    activate(ctx)
    jest.spyOn(Math, 'random').mockReturnValue(0.99)

    playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })

    expect(ctx.gs.getPlayer('p1')!.getHand()).toEqual(['c'])
  })

  it('announces the pull', () => {
    const ctx = setup(['a'])
    activate(ctx)
    playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })

    const pulled = ctx.events.filter(
      (e) => e.getType() === GameEventType.CardPulled,
    )
    expect(pulled).toHaveLength(1)
    expect(pulled[0].getPayload()).toEqual({
      cardId: 'a',
      fromPlayerId: 'p2',
      toPlayerId: 'p1',
    })
  })

  it('an empty hand costs the activation and yields nothing', () => {
    const ctx = setup([])
    activate(ctx)
    playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })

    expect(ctx.gs.getPlayer('p1')!.getHand()).toEqual([])
    expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(2)
    expect(ctx.gs.getAbilitiesUsedThisTurn()).toContain(CLAW)
  })

  it('an IDLE player pulls nothing, and the point is spent anyway', () => {
    const ctx = setup(['a'])
    activate(ctx)
    jest.advanceTimersByTime(5000)

    // PlayerChoiceWindow overrides no defaultChoice, so silence picks nobody
    // — unlike a CARD choice, which draws one of its own options at random.
    // The activation is not refunded: markAbilityUsed and the point both ran
    // before the question was asked.
    expect(ctx.gs.getPlayer('p1')!.getHand()).toEqual([])
    expect(ctx.gs.getPlayer('p2')!.getHand()).toEqual(['a'])
    expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(2)
    expect(ctx.gs.getAbilitiesUsedThisTurn()).toContain(CLAW)
  })

  it('cannot be activated twice in a turn', () => {
    const ctx = setup(['a', 'b'])
    activate(ctx)
    playerChoice(ctx.gs)!.submitReaction('p1', { choice: 'p2' })

    ctx.tm.enqueue(new RollOnLeaderAction('a2', 'p1', CLAW, ctx.em))

    expect(ctx.gs.getPlayer('p1')!.getHand()).toHaveLength(1)
    expect(ctx.gs.getPlayer('p1')!.getActionPoints()).toBe(2)
  })

  it('somebody else cannot reach for it', () => {
    const ctx = setup(['a'])
    // p2 leads with a different card, so the action refuses and the registry
    // is never consulted.
    ctx.tm.enqueue(new RollOnLeaderAction('a1', 'p2', CLAW, ctx.em))

    expect(playerChoice(ctx.gs)).toBeUndefined()
    expect(ctx.gs.getPlayer('p2')!.getActionPoints()).toBe(3)
  })
})
