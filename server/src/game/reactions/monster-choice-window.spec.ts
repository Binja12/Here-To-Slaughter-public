import {
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  ReactionWindowType,
  RollCompareMode,
} from 'shared'
import { MonsterChoiceWindow } from './monster-choice-window'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { HeroCard } from '../cards/hero-card'
import { MonsterCard } from '../cards/monster-card'
import { CTX_CHOSEN_CARD } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const hero = (id: string, heroClass: HeroClass) =>
  new HeroCard({
    id,
    name: id,
    type: CardType.Hero,
    image: '',
    description: '',
    set: 'test',
    heroClass,
    rollReq: 5,
  })

/** The Dark Dragon King's shape: a Bard plus one more hero. */
const monster = (id: string) =>
  new MonsterCard({
    id,
    name: id,
    type: CardType.Monster,
    image: '',
    description: '',
    set: 'test',
    partyReq: { classes: [HeroClass.Bard, 'Any'] },
    higherReq: 8,
    lowerReq: 4,
    rollCompareMode: RollCompareMode.HighToWin,
  })

function setup(heroClasses: HeroClass[]) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

  const heroIds = heroClasses.map((cls, i) => {
    const id = `hero-${i}`
    gs.registerCard(hero(id, cls))
    return id
  })

  gs.registerPlayer(
    new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds, monsterIds: [] }),
  )

  gs.registerCard(monster('monster-1'))
  gs.getMonsterPile().add('monster-1')

  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })

  return { gs, em, emitted }
}

function makeWindow(
  gs: GameState,
  em: GameEventEmitter,
  options: string[] = ['monster-1'],
) {
  const win = new MonsterChoiceWindow(
    'win-1',
    'p1',
    options,
    5000,
    gs,
    'frame-1',
    em,
  )
  gs.addFrame('frame-1', { snapshot: gs.clone(), windows: [win] })
  return win
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MonsterChoiceWindow', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('getType() returns MonsterChoice', () => {
    const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
    expect(makeWindow(gs, em).getType()).toBe(ReactionWindowType.MonsterChoice)
  })

  it('files its pick under the card slot, like any card choice', () => {
    const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
    expect(makeWindow(gs, em).resultKey()).toBe(CTX_CHOSEN_CARD)
  })

  // --- canSubmit ---

  describe('a pick that is still legal', () => {
    it('is accepted and resolves the window', () => {
      const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
      const win = makeWindow(gs, em)

      win.submitReaction('p1', { choice: 'monster-1' })

      expect(win.isOpen()).toBe(false)
    })
  })

  describe('a pick the party can no longer make', () => {
    /** The Bard leaves, so [Bard, 'Any'] is no longer met. */
    const breakTheParty = (gs: GameState, em: GameEventEmitter) =>
      gs.getParty('p1').removeHero('hero-0', em, 'Stolen')

    it('THROWS rather than being silently dropped', () => {
      const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
      const win = makeWindow(gs, em)
      breakTheParty(gs, em)

      expect(() => win.submitReaction('p1', { choice: 'monster-1' })).toThrow(
        /no longer a legal choice/,
      )
    })

    it('leaves the window OPEN, so the player can pick again', () => {
      const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
      const win = makeWindow(gs, em)
      breakTheParty(gs, em)

      expect(() => win.submitReaction('p1', { choice: 'monster-1' })).toThrow()

      expect(win.isOpen()).toBe(true)
      expect(gs.frames.has('frame-1')).toBe(true)
    })

    it('does NOT reset the clock — a refused pick cannot stall the turn', () => {
      const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
      const win = makeWindow(gs, em)
      breakTheParty(gs, em)

      jest.advanceTimersByTime(4000)
      expect(() => win.submitReaction('p1', { choice: 'monster-1' })).toThrow()

      // Still the ORIGINAL 5s deadline: one more second ends it.
      jest.advanceTimersByTime(1000)
      expect(win.isOpen()).toBe(false)
    })
  })

  it('a choice that was never offered is refused silently, not thrown', () => {
    const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
    const win = makeWindow(gs, em)

    expect(() =>
      win.submitReaction('p1', { choice: 'monster-not-offered' }),
    ).not.toThrow()
    expect(win.isOpen()).toBe(true)
  })

  it('a submission from another player is refused silently', () => {
    const { gs, em } = setup([HeroClass.Bard, HeroClass.Thief])
    const win = makeWindow(gs, em)

    expect(() => win.submitReaction('p2', { choice: 'monster-1' })).not.toThrow()
    expect(win.isOpen()).toBe(true)
  })

  // --- defaultChoice ---

  describe('silence', () => {
    it('is NOT an attack — an idle player picks nothing', () => {
      const { gs, em, emitted } = setup([HeroClass.Bard, HeroClass.Thief])
      makeWindow(gs, em)

      jest.advanceTimersByTime(5000)

      const resolved = emitted.find(
        (e) => e.getType() === GameEventType.FrameResolved,
      )
      expect(resolved!.getPayload()).toMatchObject({
        result: { key: CTX_CHOSEN_CARD, value: [] },
      })
    })

    it('picks nothing even with several monsters on offer', () => {
      const { gs, em, emitted } = setup([HeroClass.Bard, HeroClass.Thief])
      gs.registerCard(monster('monster-2'))
      gs.getMonsterPile().add('monster-2')
      makeWindow(gs, em, ['monster-1', 'monster-2'])

      jest.advanceTimersByTime(5000)

      const resolved = emitted.find(
        (e) => e.getType() === GameEventType.FrameResolved,
      )
      expect(resolved!.getPayload()).toMatchObject({
        result: { key: CTX_CHOSEN_CARD, value: [] },
      })
    })
  })

  it('with no options at all it settles at once and picks nothing', () => {
    const { gs, em, emitted } = setup([])
    makeWindow(gs, em, [])

    jest.advanceTimersByTime(0)

    expect(
      emitted.some((e) => e.getType() === GameEventType.FrameResolved),
    ).toBe(true)
    expect(gs.frames.has('frame-1')).toBe(false)
  })
})
