import {
  Audience,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
  TriggerScope,
} from 'shared'
import { SnowballAbility } from './snowball-ability'
import { DrawTask } from '../../tasks/tasks'
import { GameState } from '../../pipelines/game-state'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { HeroCard } from '../../cards/hero-card'
import { MagicCard } from '../../cards/magic-card'
import { AbilityContext, CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { IAbilityRule, ITask } from '../../interfaces'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { ReactionManager as ReactionManagerImpl } from '../../pipelines/reaction-manager'
import { TaskManager } from '../../pipelines/task-manager'
import { GameEventFactory } from '../../events/game-event-factory'
import { CONFIRM, DISMISS } from '../../reactions/task-choice-window'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const makeGs = (deckCards: string[] = []) => {
  const deck = new CardStack('deck', 'main')
  for (const c of deckCards) deck.addToBottom(c)
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPoints: 3,
  })
  const party = new Party({
    playerId: 'p1',
    leaderId: 'leader-1',
    heroIds: [],
    monsterIds: [],
  })
  const gs = new GameState(
    deck,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  gs.registerPlayer(player)
  gs.registerParty(party)
  return { gs, player }
}

const makeCtx = () => new AbilityContext('src-card', 'p1')

const makeEmitter = () => {
  const emitter = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  emitter.addListener({ onEvent: (e) => emitted.push(e) })
  return { emitter, emitted }
}

/** Stub ReactionManager — tasks under test don't open frames. */
const stubRm = null as unknown as ReactionManagerImpl

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
    heroClass: HeroClass.Wizard,
    rollReq: 4,
    set: 'base',
  })

// ---------------------------------------------------------------------------
// DrawTask
// ---------------------------------------------------------------------------

describe('DrawTask', () => {
  it('draws N cards and adds them to player hand', () => {
    const { gs, player } = makeGs(['card-1', 'card-2'])
    const { emitter } = makeEmitter()
    new DrawTask(2).execute(gs, makeCtx(), emitter, stubRm)
    expect(player.getHand()).toContain('card-1')
    expect(player.getHand()).toContain('card-2')
  })

  it('emits CardDrawn (PlayerOnly) for each card drawn', () => {
    const { gs } = makeGs(['card-1'])
    const { emitter, emitted } = makeEmitter()
    new DrawTask(1).execute(gs, makeCtx(), emitter, stubRm)
    expect(emitted).toHaveLength(1)
    expect(emitted[0].getType()).toBe(GameEventType.CardDrawn)
    expect(emitted[0].getAudience()).toBe(Audience.PlayerOnly)
  })

  it('stores every drawn cardId in context, as an array', () => {
    const { gs } = makeGs(['card-1', 'card-2'])
    const ctx = makeCtx()
    const { emitter } = makeEmitter()
    new DrawTask(2).execute(gs, ctx, emitter, stubRm)
    expect(ctx.get(CTX_DRAWN_CARD_IDS)).toEqual(['card-1', 'card-2'])
  })

  it('stops drawing when deck is empty', () => {
    const { gs, player } = makeGs(['card-1'])
    const { emitter, emitted } = makeEmitter()
    new DrawTask(3).execute(gs, makeCtx(), emitter, stubRm)
    expect(emitted).toHaveLength(1)
    expect(player.getHand()).toHaveLength(1)
  })

  it('emits nothing when player not found', () => {
    const deck = new CardStack('d', 'm')
    deck.addToBottom('card-1')
    const gs = new GameState(
      deck,
      new CardPile('discard', 'discard'),
      new CardStack('mdeck', 'monster-deck'),
      new CardPile('mpile', 'monster-pile'),
    )
    const { emitter, emitted } = makeEmitter()
    new DrawTask(1).execute(
      gs,
      new AbilityContext('src', 'unknown-player'),
      emitter,
      stubRm,
    )
    expect(emitted).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SnowballAbility — end to end, through the real processor. The play and the
// second draw share one entry, unlocked by answering the prompt.
// ---------------------------------------------------------------------------

function setup(deckCards: string[]) {
  const { gs, player } = makeGs(deckCards)
  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  const rm = new ReactionManagerImpl(gs, em)
  new TaskManager(
    gs,
    em,
    rm,
    new Map<string, IAbilityRule[]>([
      ['snowball', SnowballAbility],
      // A played magic card that does nothing. It still needs an ENTRY —
      // no entry means no pipeline, and nothing to announce it finished.
      [
        'magic-1',
        [
          {
            trigger: {
              on: GameEventType.FrameResolved,
              scope: TriggerScope.SelfCard,
            },
            steps: [],
          },
        ],
      ],
    ]),
  )
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId: 'leader-1',
      heroIds: ['snowball'],
      monsterIds: [],
    }),
  )
  return { gs, player, em, events }
}

const fire = (em: GameEventEmitter) =>
  em.emit(GameEventFactory.rollSuccess('p1', 'snowball'))

const openPrompt = (gs: GameState) =>
  [...gs.frames.values()]
    .flatMap((f) => f.windows)
    .find((w) => w.isOpen())

const drawnCount = (events: IGameEvent[]) =>
  events.filter((e) => e.getType() === GameEventType.CardDrawn).length

/**
 * Settle the played card's challenge window, uncontested. PlayMagicTask
 * suspends the rest of Snowball's entry on that window, so nothing after the
 * play happens until it resolves.
 */
const unchallenged = () => jest.advanceTimersByTime(5000)

/** Seat an opponent, so there is somebody to challenge with. */
const seatOpponent = (gs: GameState) => {
  gs.registerPlayer(
    new Player({
      id: 'p2',
      name: 'P2',
      hand: [],
      partyId: 'party-2',
      actionPoints: 3,
    }),
  )
  gs.registerParty(
    new Party({
      playerId: 'p2',
      leaderId: 'leader-2',
      heroIds: [],
      monsterIds: [],
    }),
  )
}

describe('SnowballAbility', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('is declared as three entries — draw, ask, play and draw', () => {
    // It pauses twice: once on a test, once on a question. Neither the
    // condition nor the confirm holds the steps it guards.
    expect(SnowballAbility).toHaveLength(3)
    expect(SnowballAbility[0].trigger.on).toBe(GameEventType.RollSuccess)
    expect(SnowballAbility[1].trigger.on).toBe(GameEventType.ConditionMet)
    expect(SnowballAbility[2].trigger.on).toBe(GameEventType.TaskConfirmed)
  })

  it('draws once and asks nothing when the card is not Magic', () => {
    const { gs, player, em, events } = setup(['hero-1'])
    gs.registerCard(makeHeroCard('hero-1'))

    fire(em)

    expect(player.getHand()).toContain('hero-1')
    expect(drawnCount(events)).toBe(1)
    expect(openPrompt(gs)).toBeUndefined()
  })

  it('asks before the second draw when the card is Magic', () => {
    const { gs, player, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))

    fire(em)

    expect(player.getHand()).toEqual(['magic-1'])
    expect(drawnCount(events)).toBe(1)
    expect(openPrompt(gs)).toBeDefined()
  })

  it('CONFIRM plays the magic card and draws the second', () => {
    const { gs, player, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })
    unchallenged()

    // magic-1 was played out of hand; only the second draw is left.
    expect(player.getHand()).toEqual(['card-2'])
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
    expect(drawnCount(events)).toBe(2)
  })

  it('plays the card BEFORE drawing the second — printed order', () => {
    const { gs, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })
    unchallenged()

    const played = events.findIndex(
      (e) => e.getType() === GameEventType.MagicPlayed,
    )
    const secondDraw = events.reduce(
      (last, e, i) => (e.getType() === GameEventType.CardDrawn ? i : last),
      -1,
    )
    expect(played).toBeGreaterThan(-1)
    expect(played).toBeLessThan(secondDraw)
  })

  it('the drawn card reaches the continuation across both hops', () => {
    // Fresh context per entry: the card only arrives as ctxSeed, seeded by the
    // condition and re-seeded by the confirm's subjectKey.
    const { gs, em } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })
    unchallenged()

    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
  })

  it('waits on the challenge before playing the card or drawing again', () => {
    const { gs, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })

    // The play is announced and the challenge is open on it; everything the
    // card does, and the second draw, wait on that window.
    expect(openPrompt(gs)!.getType()).toBe(ReactionWindowType.Challenge)
    expect(events.some((e) => e.getType() === GameEventType.MagicPlayed)).toBe(
      true,
    )
    expect(gs.getParty('p1').getInstanceCardIds()).toContain('magic-1')
    expect(drawnCount(events)).toBe(1)
  })

  it('the card Snowball played is disposed once ITS OWN run ends', () => {
    const { gs, em } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)
    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })

    unchallenged() // the play stands

    // Disposal is keyed to the card whose run ended, not to whatever played
    // it: Snowball's own AbilityDone names snowball and matches nothing in the
    // instance pile. magic-1's names magic-1, which is what puts it away.
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
  })

  it('leaves Snowball itself alone — it was never in an instance pile', () => {
    const { gs, em } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)
    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })

    unchallenged()

    expect(gs.getParty('p1').getHeroIds()).toContain('snowball')
    expect(gs.getDiscardPile().getAll()).not.toContain('snowball')
  })

  it('a lost challenge cancels the play AND the draw behind it', () => {
    const { gs, player, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    seatOpponent(gs)
    fire(em)
    openPrompt(gs)!.submitReaction('p1', { choice: CONFIRM })

    // Challenger rolls 11, Snowball's owner rolls 1.
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    openPrompt(gs)!.submitReaction('p2', {
      type: 'challenge',
      challengerId: 'p2',
    })
    unchallenged()

    // The entry was suspended on that window, so the rollback takes the second
    // draw with it — the same way a lost challenge un-grants a hero's roll.
    // The card is out of the instance pile, so none of its steps ever match.
    expect(gs.getParty('p1').getInstanceCardIds()).not.toContain('magic-1')
    expect(drawnCount(events)).toBe(1)
    // Spent either way: out of hand before the snapshot, discarded by the
    // window on the losing branch.
    expect(player.getHand()).not.toContain('magic-1')
    expect(gs.getDiscardPile().getAll()).toContain('magic-1')
  })

  it('DISMISS draws nothing more, and emits no TaskConfirmed to trigger it', () => {
    const { gs, player, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    openPrompt(gs)!.submitReaction('p1', { choice: DISMISS })

    expect(player.getHand()).toEqual(['magic-1'])
    expect(drawnCount(events)).toBe(1)
    // One answer gates both halves: no play either.
    expect(events.some((e) => e.getType() === GameEventType.MagicPlayed)).toBe(
      false,
    )
    expect(
      events.some((e) => e.getType() === GameEventType.TaskConfirmed),
    ).toBe(false)
    expect(gs.frames.size).toBe(0)
  })

  it('an idle player plays and draws nothing more — timeout is a DISMISS', () => {
    const { gs, player, em, events } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    jest.advanceTimersByTime(5000)

    expect(player.getHand()).toEqual(['magic-1'])
    expect(drawnCount(events)).toBe(1)
  })

  it('keeps the first draw when the prompt is declined', () => {
    const { gs, player, em } = setup(['magic-1', 'card-2'])
    gs.registerCard(makeMagicCard('magic-1'))
    fire(em)

    openPrompt(gs)!.submitReaction('p1', { choice: DISMISS })

    expect(player.getHand()).toContain('magic-1')
  })
})
