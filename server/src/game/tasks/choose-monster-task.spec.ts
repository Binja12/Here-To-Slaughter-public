import {
  CardType,
  HeroClass,
  HeroClassReq,
  IGameEvent,
  ReactionWindowType,
  RollCompareMode,
} from 'shared'
import { ChooseMonsterTask } from './choose-tasks'
import { AttackMonsterTask } from './attack-monster-task'
import { GameState } from '../pipelines/game-state'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { MonsterCard } from '../cards/monster-card'
import { AbilityContext, CTX_CHOSEN_CARD } from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { ReactionManager } from '../pipelines/reaction-manager'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const monsterCard = (id: string, classes: HeroClassReq[]) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'test',
    partyReq: { classes },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
  })

function setup(row: HeroClassReq[][], partyClasses: HeroClass[]) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })

  gs.registerPlayer(
    new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }),
  )

  row.forEach((classes, i) => {
    gs.registerCard(monsterCard(`m-${i}`, classes))
    gs.getMonsterPile().add(`m-${i}`)
  })

  partyClasses.forEach((cls, i) => {
    gs.registerCard(
      new HeroCard({
        id: `hero-${i}`,
        name: `hero-${i}`,
        type: CardType.Hero,
        image: '',
        description: '',
        set: 'test',
        heroClass: cls,
        rollReq: 5,
      }),
    )
    gs.getParty('p1').addHero(`hero-${i}`, em, 'Played')
  })

  return { gs, em, emitted, rm: new ReactionManager(gs, em) }
}

const opened = (emitted: IGameEvent[]) =>
  emitted
    .map((e) => e.getPayload() as Record<string, unknown>)
    .find((p) => p['windowType'] === ReactionWindowType.MonsterChoice)

// ---------------------------------------------------------------------------
// ChooseMonsterTask
// ---------------------------------------------------------------------------

describe('ChooseMonsterTask', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const KING: HeroClassReq[] = [HeroClass.Bard, 'Any']
  const FREE: HeroClassReq[] = []

  const ctx = () => new AbilityContext('src-card', 'p1')

  it('opens a MonsterChoice window, not a plain card choice', () => {
    const { gs, em, emitted, rm } = setup([FREE], [])
    new ChooseMonsterTask().execute(gs, ctx(), em, rm)
    expect(opened(emitted)).toBeDefined()
  })

  it('offers only the monsters the party can actually attack', () => {
    const { gs, em, emitted, rm } = setup([KING, FREE], [])
    new ChooseMonsterTask().execute(gs, ctx(), em, rm)
    expect(opened(emitted)!['options']).toEqual(['m-1'])
  })

  it('offers one the party has grown into', () => {
    const { gs, em, emitted, rm } = setup([KING], [HeroClass.Bard, HeroClass.Thief])
    new ChooseMonsterTask().execute(gs, ctx(), em, rm)
    expect(opened(emitted)!['options']).toEqual(['m-0'])
  })

  it('returns the frameId, so the declaring entry waits on the pick', () => {
    const { gs, em, rm } = setup([FREE], [])
    const frameId = new ChooseMonsterTask().execute(gs, ctx(), em, rm)
    expect(typeof frameId).toBe('string')
    expect(gs.frames.has(frameId as string)).toBe(true)
  })

  describe('with nothing it may attack', () => {
    it('offers an empty list rather than every monster', () => {
      const { gs, em, emitted, rm } = setup([KING], [])
      new ChooseMonsterTask().execute(gs, ctx(), em, rm)
      expect(opened(emitted)!['options']).toEqual([])
    })

    it('settles at once and leaves the slot empty — the task just ends', () => {
      const { gs, em, rm } = setup([KING], [])
      const c = ctx()

      new ChooseMonsterTask().execute(gs, c, em, rm)
      jest.advanceTimersByTime(0)

      // TaskManager files the window's result; here the window wrote nothing
      // to file, which is what the steps behind read as "produced nothing".
      expect(gs.frames.size).toBe(0)
    })

    it('the attack behind it skips on the empty slot', () => {
      const { gs, em, emitted, rm } = setup([KING], [])
      const c = ctx()
      c.set(CTX_CHOSEN_CARD, [])

      expect(
        new AttackMonsterTask().execute(gs, c, em, rm),
      ).toBeUndefined()
      expect(opened(emitted)).toBeUndefined()
    })
  })

  it('the attack behind it refuses a monster the party can no longer field', () => {
    const { gs, em, emitted, rm } = setup([KING], [HeroClass.Bard, HeroClass.Thief])
    const c = ctx()
    c.set(CTX_CHOSEN_CARD, ['m-0'])

    gs.getParty('p1').removeHero('hero-0', em, 'Stolen')

    expect(new AttackMonsterTask().execute(gs, c, em, rm)).toBeUndefined()
    expect(opened(emitted)).toBeUndefined()
  })
})
