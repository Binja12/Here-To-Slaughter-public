import {
  ActionType,
  CardType,
  GameEventType,
  HeroClass,
  IGameEvent,
  RefusalReason,
} from 'shared'
import { RollOnLeaderAction } from './roll-on-leader-action'
import { GameState } from '../pipelines/game-state'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { PartyLeaderCard } from '../cards/party-leader-card'
import { GameEventEmitter } from '../events/game-event-emitter'
import { TurnManager } from '../pipelines/turn-manager'

// ---------------------------------------------------------------------------
// RollOnLeaderAction — the only way a leader's ability ever runs.
//
// Every clause of "once per turn on your turn, you may spend an action point"
// is a guard here; the declaration in the registry is only what happens next.
// ---------------------------------------------------------------------------

const CLAW = 'leader-117'

function setup(leaderId = CLAW, ap = 3) {
  const gs = new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
  for (const id of ['p1', 'p2']) {
    gs.registerPlayer(
      new Player({
        id,
        name: id,
        hand: [],
        partyId: id + '-party',
        actionPoints: ap,
      }),
    )
    gs.registerParty(
      new Party({
        playerId: id,
        leaderId: id === 'p1' ? leaderId : id + '-leader',
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
  gs.setCurrentPlayerId('p1')

  const em = new GameEventEmitter()
  const events: IGameEvent[] = []
  em.addListener({ onEvent: (e) => events.push(e) })
  return { gs, em, events }
}

const action = (em: GameEventEmitter, playerId = 'p1', cardId = CLAW) =>
  new RollOnLeaderAction('a1', playerId, cardId, em)

describe('RollOnLeaderAction', () => {
  it('reports itself as a leader activation', () => {
    const { em } = setup()
    expect(action(em).getType()).toBe(ActionType.RollOnLeader)
    expect(action(em).getId()).toBe('a1')
    expect(action(em).getPlayerId()).toBe('p1')
    expect(action(em).getCost()).toBe(1)
  })

  describe('canExecute', () => {
    it('allows the owner to activate their own leader', () => {
      const { gs, em } = setup()
      expect(action(em).canExecute(gs)).toEqual({ accepted: true })
    })

    it('refuses a card that is not the leader in the slot', () => {
      const { gs, em } = setup()
      expect(action(em, 'p1', 'leader-116').canExecute(gs)).toEqual({
        accepted: false,
        reason: RefusalReason.NotYourLeader,
      })
    })

    it('refuses another player reaching for it', () => {
      const { gs, em } = setup()
      expect(action(em, 'p2').canExecute(gs)).toEqual({
        accepted: false,
        reason: RefusalReason.NotYourLeader,
      })
    })

    it('refuses a leader whose printed ability is a passive — nothing to fire', () => {
      const { gs, em } = setup('leader-120') // the Cloaked Sage: draws on Magic plays
      expect(action(em, 'p1', 'leader-120').canExecute(gs)).toEqual({
        accepted: false,
        reason: RefusalReason.LeaderNotActivatable,
      })
    })

    it('refuses without the action point', () => {
      const { gs, em } = setup(CLAW, 0)
      expect(action(em).canExecute(gs)).toEqual({
        accepted: false,
        reason: RefusalReason.NoActionPoints,
      })
    })

    it('refuses a second time in one turn', () => {
      const { gs, em } = setup()
      action(em).execute(gs)
      expect(action(em).canExecute(gs)).toEqual({
        accepted: false,
        reason: RefusalReason.AbilityAlreadyUsed,
      })
    })

    it('allows it again on the next turn', () => {
      const { gs, em } = setup()
      const tm = new TurnManager(gs, em)
      action(em).execute(gs)

      tm.startTurn('p1') // clears the spent slots and refills the points

      expect(action(em).canExecute(gs)).toEqual({ accepted: true })
    })
  })

  describe('execute', () => {
    it('spends the action point', () => {
      const { gs, em } = setup()
      action(em).execute(gs)
      expect(gs.getPlayer('p1')!.getActionPoints()).toBe(2)
    })

    it('marks the slot spent for the turn', () => {
      const { gs, em } = setup()
      action(em).execute(gs)
      expect(gs.getAbilitiesUsedThisTurn()).toContain(CLAW)
    })

    it('announces LeaderActivated naming the LEADER — its own event, never a RollSuccess', () => {
      const { gs, em, events } = setup()
      action(em).execute(gs)

      expect(events.map((e) => e.getType())).not.toContain(GameEventType.RollSuccess)
      const success = events.filter(
        (e) => e.getType() === GameEventType.LeaderActivated,
      )
      expect(success).toHaveLength(1)
      expect(success[0].getPlayerId()).toBe('p1')
      expect(success[0].getPayload()).toEqual({ cardId: CLAW })
    })

    it('throws no dice and opens no window — there is nothing to beat', () => {
      const { gs, em, events } = setup()
      action(em).execute(gs)

      expect(events.map((e) => e.getType())).not.toContain(
        GameEventType.DiceRolled,
      )
      expect(gs.hasOpenFrames()).toBe(false)
    })

    it('marks the slot BEFORE it announces', () => {
      const { gs, em } = setup()
      const order: string[] = []
      em.addListener({
        onEvent: () => order.push(gs.getAbilitiesUsedThisTurn().join()),
      })

      action(em).execute(gs)

      // An ability that ends the turn cannot leave the slot unspent.
      expect(order[0]).toBe(CLAW)
    })
  })
})
