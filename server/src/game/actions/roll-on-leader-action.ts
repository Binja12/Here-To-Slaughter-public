import { ActionType } from 'shared'
import { IAction } from '../interfaces'
import { GameState } from '../pipelines/game-state'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventFactory } from '../events/game-event-factory'

const COST = 1

// ---------------------------------------------------------------------------
// Activating a leader — the ONLY way a leader's printed ability ever runs.
//
// A player asks for it and nothing else can: no system rule reaches a leader,
// because a leader is never played, never rolled on by another card and never
// moves. The wording it serves is "once per turn on your turn, you may spend an
// action point to …", and each clause is one line of `canExecute` plus the
// `markAbilityUsed` below.
//
// Same STRUCTURE as RollOnHeroAction — price, guards, mark, announce — with the
// dice taken out. There is no roll requirement to beat and no modifier window,
// so `RollSuccess` here is a plain "this ability fired": the registry entry is
// matched off it exactly as a hero's is, and the leader needs no special case
// anywhere in TaskManager.
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

  canExecute(gs: GameState): boolean {
    const player = gs.getPlayer(this.playerId)
    if (!player) return false
    // "on your turn"
    if (gs.getCurrentPlayerId() !== this.playerId) return false
    // "spend an action point"
    if (player.getActionPoints() < COST) return false
    // The leader has to be standing in the slot — an unassigned one has no
    // abilities to reach (§6).
    if (gs.getParty(this.playerId).getLeaderId() !== this.cardId) return false
    // "once per turn"
    if (gs.getAbilitiesUsedThisTurn().includes(this.cardId)) return false
    return true
  }

  execute(gs: GameState): void {
    gs.getPlayer(this.playerId)!.decreaseActionPoints(COST)
    // Before the announcement, so an ability that ends the turn cannot leave
    // the slot unspent — the same order RollOnHero uses around its frame.
    gs.markAbilityUsed(this.cardId)
    this.emmiter.emit(GameEventFactory.rollSuccess(this.playerId, this.cardId))
  }
}
