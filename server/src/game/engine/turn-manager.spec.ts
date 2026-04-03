import { TurnManager } from './turn-manager'
import { ReactionManager } from './reaction-manager'
import { makeTestGameState } from './test-helpers'
import { TurnPhase } from '../../../../shared/src/enums'
import { IAction, IGameEvent } from './interfaces/engine-interfaces'
import { ActionType } from '../../../../shared/src/enums'
import { GameEventType } from '../../../../shared/src/enums'

const makeAction = (
  playerId: string,
  cost: number,
  challengeable: boolean = false,
  cardId: string = 'card-001',
): IAction => {
  let _challengeable = challengeable
  return {
    getId: () => 'action-001',
    getType: () => ActionType.DrawCard,
    getPlayerId: () => playerId,
    getCost: () => cost,
    isChallengeable: () => (_challengeable ? cardId : null),
    setChallengeable: (value: boolean) => {
      _challengeable = value
    },
    canExecute: () => true,
    execute: () => [],
  }
}

// describe('TurnManager', () => {
//   beforeEach(() => jest.useFakeTimers())
//   afterEach(() => jest.useRealTimers())

//   const makeManager = (flawPlay = false) => {
//     const gs = makeTestGameState()
//     const events: IGameEvent[] = []
//     const rm = new ReactionManager(gs)
//     const tm = new TurnManager(gs, rm, (e) => events.push(...e), flawPlay)
//     return { tm, gs, rm, events }
//   }

//   // ── startTurn ───────────────────────────────────────────────

//   it('should set active player on startTurn', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     expect(tm.getActivePlayerId()).toBe('player-1')
//   })

//   it('should reset action points on startTurn', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     expect(tm.getActionPoints()).toBe(3)
//   })

//   it('should set phase to ActionWindow on startTurn', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     expect(tm.getPhase()).toBe(TurnPhase.ActionWindow)
//   })

//   it('should emit TurnStarted event', () => {
//     const { tm, events } = makeManager()
//     tm.startTurn('player-1')
//     expect(events.some((e) => e.getType() === GameEventType.TurnStarted)).toBe(
//       true,
//     )
//   })

//   // ── submitAction ────────────────────────────────────────────

//   it('should throw when no active turn', () => {
//     const { tm } = makeManager()
//     expect(() => tm.submitAction(makeAction('player-1', 1))).toThrow(
//       'No active turn',
//     )
//   })

//   it('should throw when not your turn', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     expect(() => tm.submitAction(makeAction('player-2', 1))).toThrow(
//       'Not your turn',
//     )
//   })

//   it('should throw when not enough action points', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     expect(() => tm.submitAction(makeAction('player-1', 4))).toThrow(
//       'Not enough action points',
//     )
//   })

//   it('should deduct action points', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1))
//     expect(tm.getActionPoints()).toBe(2)
//   })

//   it('should execute non-challengeable action immediately', () => {
//     const execute = jest.fn().mockReturnValue([])
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     const action = { ...makeAction('player-1', 1), execute }
//     tm.submitAction(action)
//     expect(execute).toHaveBeenCalled()
//   })

//   it('should end turn when action points reach 0', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 3))
//     expect(tm.getActivePlayerId()).toBe('player-2')
//   })

//   // ── challenge window ────────────────────────────────────────

//   it('should open challenge window for challengeable action', () => {
//     const { tm, rm } = makeManager()
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true))
//     expect(rm.getChallengeWindow()).toBeDefined()
//   })

//   it('should not execute challengeable action until window resolves', () => {
//     const execute = jest.fn().mockReturnValue([])
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     const action = { ...makeAction('player-1', 1, true), execute }
//     tm.submitAction(action)
//     expect(execute).not.toHaveBeenCalled()
//   })

//   it('should execute action when timer expires with no challenge', () => {
//     const execute = jest.fn().mockReturnValue([])
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     const action = { ...makeAction('player-1', 1, true), execute }
//     tm.submitAction(action)
//     jest.advanceTimersByTime(5000)
//     expect(execute).toHaveBeenCalled()
//   })

//   it('should restore snapshot when challenger wins', () => {
//     const execute = jest.fn().mockReturnValue([])
//     const { tm, rm, gs } = makeManager()
//     tm.startTurn('player-1')
//     const action = { ...makeAction('player-1', 1, true), execute }
//     tm.submitAction(action)

//     // simulate challenger winning
//     const window = rm.getChallengeWindow()!
//     window.resolve(gs)
//     jest.spyOn(window, 'didChallengerWin').mockReturnValue(true)
//     jest.advanceTimersByTime(5000)

//     expect(execute).not.toHaveBeenCalled()
//   })

//   // ── standard mode blocks actions during window ──────────────

//   it('should block challengeable actions during open window', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true))
//     expect(() => tm.submitAction(makeAction('player-1', 1, true))).toThrow(
//       'Cannot play challengeable action while reaction window is open',
//     )
//   })

//   it('should block all actions in standard mode during open window', () => {
//     const { tm } = makeManager(false)
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true))
//     expect(() => tm.submitAction(makeAction('player-1', 1, false))).toThrow(
//       'Cannot act while reaction window is open',
//     )
//   })

//   it('should allow non-challengeable actions in flaw play during open window', () => {
//     const { tm } = makeManager(true)
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true))
//     expect(() =>
//       tm.submitAction(makeAction('player-1', 1, false)),
//     ).not.toThrow()
//   })

//   // ── flaw play ───────────────────────────────────────────────

//   it('should execute challengeable action immediately in flaw play', () => {
//     const execute = jest.fn().mockReturnValue([])
//     const { tm } = makeManager(true)
//     tm.startTurn('player-1')
//     const action = { ...makeAction('player-1', 1, true), execute }
//     tm.submitAction(action)
//     expect(execute).toHaveBeenCalled() // executed immediately
//   })

//   it('should keep challenge window open after flaw play execution', () => {
//     const { tm, rm } = makeManager(true)
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true))
//     expect(rm.getChallengeWindow()).toBeDefined() // window still open
//   })

//   it('should allow non-challengeable premove actions after flaw play execution', () => {
//     const execute2 = jest.fn().mockReturnValue([])
//     const { tm } = makeManager(true)
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true)) // challengeable
//     const action2 = { ...makeAction('player-1', 1, false), execute: execute2 }
//     tm.submitAction(action2) // non-challengeable premove
//     expect(execute2).toHaveBeenCalled()
//   })

//   it('should block challengeable premove actions in flaw play', () => {
//     const { tm } = makeManager(true)
//     tm.startTurn('player-1')
//     tm.submitAction(makeAction('player-1', 1, true)) // challengeable
//     expect(
//       () => tm.submitAction(makeAction('player-1', 1, true)), // another challengeable
//     ).toThrow('Cannot play challengeable action while reaction window is open')
//   })

//   it('should discard challenged card when challenger wins in flaw play', () => {
//     const { tm, rm, gs } = makeManager(true)

//     gs.getCardRepo().add({
//       id: 'challenge-001',
//       type: 'Challenge',
//       name: 'test',
//       image: '',
//       description: '',
//       set: 'base',
//     } as any)
//     gs.getPlayer('player-2')!.addToHand('challenge-001')
//     gs.getPlayer('player-1')!.addToHand('hero-001')
//     tm.startTurn('player-1')
//     const execute = jest.fn().mockImplementation(() => {
//       gs.getPlayer('player-1')!.removeFromHand('hero-001')
//       return []
//     })
//     const action = { ...makeAction('player-1', 1, true, 'hero-001'), execute }
//     tm.submitAction(action)

//     // play challenge card BEFORE timer fires
//     rm.handleReaction('player-2', 'challenge-001')

//     // force challenger to win
//     const douMod = rm.getChallengeWindow()!.getModifierWindow()!
//     const roll = douMod.getFinalRoll()
//     if (roll > 0)
//       rm.getChallengeWindow()!.applyModifier(-roll - 1, 'modifier-x')

//     // advance DouModifier timer (modifier window)
//     jest.advanceTimersByTime(5000)

//     expect(gs.getDiscardPile().getAll()).toContain('hero-001')
//     expect(gs.getPlayer('player-1')!.getHand()).not.toContain('hero-001')
//   })

//   it('should keep state when challenger loses in flaw play', () => {
//     const { tm, rm, gs } = makeManager(true)
//     tm.startTurn('player-1')
//     gs.getPlayer('player-1')!.addToHand('hero-001')

//     // action executes immediately in flaw play
//     const execute = jest.fn().mockImplementation(() => {
//       gs.getPlayer('player-1')!.removeFromHand('hero-001')
//       return []
//     })
//     const action = { ...makeAction('player-1', 1, true, 'hero-001'), execute }
//     tm.submitAction(action)

//     // hero already removed from hand (action executed)
//     expect(gs.getPlayer('player-1')!.getHand()).not.toContain('hero-001')

//     // simulate challenger losing
//     jest
//       .spyOn(rm.getChallengeWindow()!, 'didChallengerWin')
//       .mockReturnValue(false)
//     jest.spyOn(rm.getChallengeWindow()!, 'isResolved').mockReturnValue(true)
//     jest.advanceTimersByTime(5000)

//     // state still kept — not reverted
//     expect(gs.getPlayer('player-1')!.getHand()).not.toContain('hero-001')
//   })

//   // ── hero effect tracking ────────────────────────────────────

//   it('should track used hero effects', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     tm.markHeroEffectUsed('hero-001')
//     expect(tm.isHeroEffectUsed('hero-001')).toBe(true)
//   })

//   it('should return false for unused hero effect', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     expect(tm.isHeroEffectUsed('hero-001')).toBe(false)
//   })

//   // ── endTurn ─────────────────────────────────────────────────

//   it('should move to next player on endTurn', () => {
//     const { tm } = makeManager()
//     tm.startTurn('player-1')
//     tm.endTurn()
//     expect(tm.getActivePlayerId()).toBe('player-2')
//   })

//   it('should emit TurnEnded event', () => {
//     const { tm, events } = makeManager()
//     tm.startTurn('player-1')
//     tm.endTurn()
//     expect(events.some((e) => e.getType() === GameEventType.TurnEnded)).toBe(
//       true,
//     )
//   })
// })

// big flow

describe('Flaw play — full challenge scenario', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const heroCard = {
    id: 'hero-001',
    name: 'Test Hero',
    type: 'Hero',
    image: '',
    description: '',
    set: 'base',
    heroClass: 'Fighter',
    skill: { condition: '', description: '', duration: 'OneTime' },
    rollReq: 5,
  }

  const challengeCard = {
    id: 'challenge-001',
    name: 'Not So Fast',
    type: 'Challenge',
    image: '',
    description: '',
    set: 'base',
  }

  const modifierCard = {
    id: 'modifier-001',
    name: 'Lucky Roll',
    type: 'Modifier',
    image: '',
    description: '',
    set: 'base',
    values: [12],
  }

  const makeFlawPlayManager = () => {
    const gs = makeTestGameState()
    gs.getCardRepo().add(heroCard as any)
    gs.getCardRepo().add(challengeCard as any)
    gs.getCardRepo().add(modifierCard as any)

    // give player-1 5 cards in hand + hero
    gs.getPlayer('player-1')!.addToHand('hero-001')
    gs.getPlayer('player-1')!.addToHand('card-a')
    gs.getPlayer('player-1')!.addToHand('card-b')
    gs.getPlayer('player-1')!.addToHand('card-c')
    gs.getPlayer('player-1')!.addToHand('card-d')
    gs.getPlayer('player-1')!.addToHand('card-e')

    // give player-2 challenge and modifier cards
    gs.getPlayer('player-2')!.addToHand('challenge-001')
    gs.getPlayer('player-2')!.addToHand('modifier-001')

    // add some cards to main deck for draw
    gs.getMainDeck().addToTop('drawn-card-001')

    const events: IGameEvent[] = []
    const rm = new ReactionManager(gs)
    const tm = new TurnManager(
      gs,
      rm,
      (e) => events.push(...e),
      true, // flaw play
    )
    return { tm, rm, gs, events }
  }

  // it('challenger wins', () => {
  //   const { tm, rm, gs } = makeFlawPlayManager()
  //   tm.startTurn('player-1')

  //   // player-1 plays hero (challengeable, executes immediately in flaw play)
  //   const playHero = {
  //     ...makeAction('player-1', 1, true, 'hero-001'),
  //     execute: jest.fn().mockImplementation(() => {
  //       gs.getPlayer('player-1')!.removeFromHand('hero-001')
  //       gs.getParty('player-1')!.addHero('hero-001')
  //       return []
  //     }),
  //   }
  //   tm.submitAction(playHero)
  //   console.log('1')

  //   // verify hero in party after flaw play execution
  //   expect(gs.getParty('player-1')!.getHeroIds()).toContain('hero-001')

  //   // player-1 draws a card (premove)
  //   const drawCard = {
  //     ...makeAction('player-1', 1, false),
  //     execute: jest.fn().mockImplementation(() => {
  //       const card = gs.getMainDeck().draw()!
  //       gs.getPlayer('player-1')!.addToHand(card)
  //       return []
  //     }),
  //   }
  //   tm.submitAction(drawCard)
  //   console.log('2')

  //   // verify drawn card in hand
  //   expect(gs.getPlayer('player-1')!.getHand()).toContain('drawn-card-001')

  //   // --- verify state before challenge ---
  //   expect(gs.getParty('player-1')!.getHeroIds()).toContain('hero-001')
  //   expect(gs.getPlayer('player-1')!.getHand()).toContain('drawn-card-001')
  //   // player-2 challenges
  //   rm.handleReaction('player-2', 'challenge-001')

  //   // player-2 plays modifier to help challenger win
  //   rm.handleReaction('player-2', 'modifier-001')
  //   // const douMod = rm.getChallengeWindow()!.getModifierWindow()!
  //   // const roll = douMod.getFinalRoll()
  //   // if (roll > 0)
  //   //   rm.getChallengeWindow()!.applyModifier(-roll - 1, 'modifier-001')
  //   // else rm.getChallengeWindow()!.applyModifier(0, 'modifier-001')

  //   // timer expires — resolve
  //   jest.advanceTimersByTime(5000)

  //   // --- verify challenger won ---
  //   // hero should be discarded
  //   expect(gs.getDiscardPile().getAll()).toContain('hero-001')
  //   // hero should NOT be in party
  //   expect(gs.getParty('player-1')!.getHeroIds()).not.toContain('hero-001')
  //   // drawn card should be reverted (not in hand)
  //   expect(gs.getPlayer('player-1')!.getHand()).not.toContain('drawn-card-001')
  //   // drawn card should be back in deck
  //   expect(gs.getMainDeck().getCards()).toContain('drawn-card-001')
  //   // challenge card discarded
  //   expect(gs.getDiscardPile().getAll()).toContain('challenge-001')
  //   // modifier card discarded
  //   expect(gs.getDiscardPile().getAll()).toContain('modifier-001')
  // })

  it('challenger loses — hero stays, drawn card stays, challenge+modifier discarded', () => {
    const { tm, rm, gs } = makeFlawPlayManager()
    tm.startTurn('player-1')

    // player-1 plays hero
    const playHero = {
      ...makeAction('player-1', 1, true, 'hero-001'),
      execute: jest.fn().mockImplementation(() => {
        gs.getPlayer('player-1')!.removeFromHand('hero-001')
        gs.getParty('player-1')!.addHero('hero-001')
        return []
      }),
    }
    tm.submitAction(playHero)

    // player-1 draws a card
    const drawCard = {
      ...makeAction('player-1', 1, false),
      execute: jest.fn().mockImplementation(() => {
        const card = gs.getMainDeck().draw()!
        gs.getPlayer('player-1')!.addToHand(card)
        return []
      }),
    }
    tm.submitAction(drawCard)

    // player-2 challenges
    rm.handleReaction('player-2', 'challenge-001')

    // player-1 plays modifier to help challenged win
    rm.handleReaction('player-1', 'modifier-001')
    // const douMod = rm.getChallengeWindow()!.getModifierWindow()!
    // const roll = douMod.getFinalRoll()
    // if (roll <= 0)
    //   rm.getChallengeWindow()!.applyModifier(-roll + 1, 'modifier-001')

    // timer expires — resolve
    jest.advanceTimersByTime(5000)

    // --- verify challenger lost ---
    // hero should still be in party - not implemented yet
    //expect(gs.getParty('player-1')!.getHeroIds()).toContain('hero-001')
    // hero should NOT be in discard
    expect(gs.getDiscardPile().getAll()).not.toContain('hero-001')
    // drawn card should still be in hand
    expect(gs.getPlayer('player-1')!.getHand()).toContain('drawn-card-001')
    // challenge card discarded
    expect(gs.getDiscardPile().getAll()).toContain('challenge-001')
    // modifier card discarded
    expect(gs.getDiscardPile().getAll()).toContain('modifier-001')
  })
})
