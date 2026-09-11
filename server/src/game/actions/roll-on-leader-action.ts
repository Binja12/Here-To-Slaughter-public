import { ActionType, RefusalReason, RequestResult } from 'shared'
import { accepted, IAction, refused } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'
import { isActivatable } from '../repositories/ability-repository'

const COST = 1

// ---------------------------------------------------------------------------
// Activating a leader — the ONLY way a leader's printed ability ever runs.
//
// A player asks for it and nothing else can: no system rule reaches a leader,
// because a leader is never played, never rolled on by another card and never
// moves. The ability it serves is used on your own turn, once per turn, by
// spending one action point — the price and the once-per-turn slot are
// `canExecute` and the `markAbilityUsed` below; the own-turn part is
// `TurnManager.enqueue`, for every action at once.
//
// Same STRUCTURE as RollOnHeroAction — price, guards, mark, announce — with the
// dice taken out. There is no roll requirement to beat and no modifier window,
// and the announcement is the leader's OWN event, `LeaderActivated`, not a
// RollSuccess: a rule on "whenever you succeed on a hero ability roll" (Arctic
// Aries) must not fire on an activation (the owner, 2026-09-04). The registry
// entry is matched off it by SelfCard exactly as a hero's is.
//
// No base class and no task twin, unlike the other rolls: one caller, and a
// second one would have to be a system rule, which is the thing this exists to
// rule out (§1).
// ---------------------------------------------------------------------------

export class RollOnLeaderAction implements IAction {
  constructor(
    private readonly id: string,
    private readonly playerId: string,
    private readonly cardId: string,
    private readonly emmiter: GameEventEmitter,
  ) {}

  getId(): string {
    return this.id
  }
  getPlayerId(): string {
    return this.playerId
  }
  getType(): ActionType {
    return ActionType.RollOnLeader
  }
  getCost(): number {
    return COST
  }

  /**
   * Nothing can be played in response — there is no roll to modify and no card
   * to challenge. True all the same, because it is what keeps the action out of
   * the queue while a window is open: the ability it fires opens windows of its
   * own, and those must not interleave with somebody else's.
   */
  isReactable(): boolean {
    return true
  }

  canExecute(gs: GameState): RequestResult {
    // the price: one action point
    if (gs.getActionPoints(this.playerId) < COST) {
      return refused(RefusalReason.NoActionPoints)
    }
    // The leader has to be standing in the slot — an unassigned one has no
    // abilities to reach (§6).
    if (gs.getParty(this.playerId).getLeaderId() !== this.cardId) {
      return refused(RefusalReason.NotYourLeader)
    }
    // The action point buys an ability — only a leader with an entry that
    // fires on the announcement. A passive leader has nothing to activate, so
    // the point would buy nothing (seen live: the Cloaked Sage).
    if (!isActivatable(this.cardId)) {
      return refused(RefusalReason.LeaderNotActivatable)
    }
    // the once-per-turn slot
    if (gs.getAbilitiesUsedThisTurn().includes(this.cardId)) {
      return refused(RefusalReason.AbilityAlreadyUsed)
    }
    return accepted()
  }

  execute(gs: GameState): void {
    gs.decreaseActionPoints(this.playerId, COST)
    // Before the announcement, so an ability that ends the turn cannot leave
    // the slot unspent — the same order RollOnHero uses around its frame.
    gs.markAbilityUsed(this.cardId)
    this.emmiter.emit(GameEventFactory.leaderActivated(this.playerId, this.cardId))
  }
}
