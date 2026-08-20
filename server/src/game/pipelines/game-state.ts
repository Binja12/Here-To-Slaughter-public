import { ICard, IGameEventEmitter, ReactionWindowType } from 'shared'
import type {
  IEffect,
  IAction,
  IModifiableWindow,
  IReactionWindow,
  ITask,
  ValueBias,
} from '../interfaces'
import type { PassiveType, RollContext } from 'shared'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import type { AbilityContext } from '../abilities/ability-context'
// Value import, not type-only: slayMonster announces. No cycle — the factory
// reaches only shared, game-event.ts and ability-context.ts.
import { GameEventFactory } from '../events/game-event-factory'

// ---------------------------------------------------------------------------
// GameFrame — snapshot taken just before the frame was opened, plus any
// reaction windows the caller inserted. Released on success, restored on rollback.
// ---------------------------------------------------------------------------

/**
 * Capability probe, not instanceof — this file names no concrete window class
 * (§9). `acceptsModifierFor` is what "a bonus can go in here" means.
 */
function isModifiable(w: IReactionWindow): w is IModifiableWindow {
  return typeof (w as IModifiableWindow).acceptsModifierFor === 'function'
}

export type GameFrame = {
  snapshot: GameState
  windows: IReactionWindow[]
}

// ---------------------------------------------------------------------------
// AbilityPipeline — one ability part-way through its steps.
// ---------------------------------------------------------------------------

export type AbilityPipeline = {
  /** What is left to do. The processor takes these off the front. */
  steps: ITask[]
  /** The memory those steps share. Also identifies the pipeline. */
  ctx: AbilityContext
  /** The frame it is paused on, if it is paused. */
  pausedOn?: string
  /**
   * True when this came from a rule nobody printed (hero-rules, instance-rules).
   * Set by TaskManager.abilitySources; read only by announceIfCardIsDone.
   */
  system?: boolean
}

export class GameState {
  private players: Map<string, Player> = new Map()
  private parties: Map<string, Party> = new Map()
  private cards: Map<string, ICard> = new Map()
  private currentPlayerId?: string
  private abilitiesUsedThisTurn: string[] = []
  private cardsChallengedThisTurn: string[] = []
  /** Actions queued for draining this turn — GS is source of truth. */
  actionQueue: IAction[] = []

  /**
   * Ability pipelines, newest on top. TaskManager works on the top one.
   *
   * A step's own events trigger more abilities while it is still running, and
   * those go on top — so they finish before the step's own pipeline continues.
   *
   * Kept here rather than on the processor so frames snapshot it: a pipeline
   * started inside a frame is undone when that frame rolls back.
   */
  abilityPipelines: AbilityPipeline[] = []

  /** All open reaction frames. Each holds its own pre-open snapshot. */
  frames: Map<string, GameFrame> = new Map()

  constructor(
    private mainDeck: CardStack,
    private discardPile: CardPile,
    private monsterDeck: CardStack,
    private monsterPile: CardPile,
  ) {}

  // ---------------------------------------------------------------------------
  // Frame API
  // ---------------------------------------------------------------------------

  addFrame(frameId: string, frame: GameFrame): void {
    this.frames.set(frameId, frame)
  }

  /**
   * Release a frame after successful resolution. Discards its snapshot, and
   * puts away whatever was spent into it.
   */
  releaseFrame(frameId: string): void {
    const frame = this.frames.get(frameId)
    if (!frame) return
    const spent = this.spentInto(frame)
    this.frames.delete(frameId)

    // Still sitting in the zone, so this is where they leave it.
    for (const { cardId, playerId } of spent) {
      this.parties.get(playerId)?.removeInstanceCard(cardId)
      this.discardPile.add(cardId)
    }
  }

  /**
   * True while `cardId` is committed to a frame that has not settled.
   *
   * Read by DisposeInstanceCardTask: a card spent into a window belongs to
   * that window until it closes, so its own ability finishing does not mean it
   * has left the table.
   */
  isSpentInOpenFrame(cardId: string): boolean {
    for (const frame of this.frames.values()) {
      if (this.spentInto(frame).some((spent) => spent.cardId === cardId)) {
        return true
      }
    }
    return false
  }

  /**
   * Restore from the frame's snapshot then delete the frame.
   * Used when a reaction fails (e.g. modifier roll doesn't meet rollReq, Challenger wins a challenge).
   */
  restoreFrame(frameId: string): void {
    const frame = this.frames.get(frameId)
    if (!frame) return
    // BEFORE the swap: the snapshot predates every burn, so restoring is what
    // erases the record of what was spent.
    const spent = this.spentInto(frame)
    this.frames.delete(frameId)
    this.copyFrom(frame.snapshot)

    // The snapshot handed them back to their owners' hands. Spent is spent,
    // whichever way the window went.
    for (const { cardId, playerId } of spent) {
      this.players.get(playerId)?.removeFromHand(cardId)
      this.discardPile.add(cardId)
    }
  }

  /**
   * What was SPENT into this frame: every card that entered an instance pile
   * inside it, except the one the frame is about.
   *
   * Derived from the zone against the frame's own snapshot, so nothing has to
   * be tracked as it happens — a card's position is the record (§11.3). The
   * exception is the whole of the distinction: a challenge frame is ABOUT the
   * card it contests, and that card is put away by whatever played it (its own
   * run on the way through, or ChallengeWindow on a defeat), while everything
   * else in the pile was thrown INTO the contest and is spent.
   *
   * MUST be read before `copyFrom` on the rollback path: restoring is what
   * destroys the evidence.
   */
  private spentInto(frame: GameFrame): { cardId: string; playerId: string }[] {
    const subject = frame.windows
      .map((w) => w.subjectCardId?.())
      .find((cardId) => !!cardId)

    const spent: { cardId: string; playerId: string }[] = []
    for (const [playerId, party] of this.parties) {
      const before = new Set(
        frame.snapshot.parties.get(playerId)?.getInstanceCardIds() ?? [],
      )
      for (const cardId of party.getInstanceCardIds()) {
        if (before.has(cardId) || cardId === subject) continue
        spent.push({ cardId, playerId })
      }
    }
    return spent
  }

  // ---------------------------------------------------------------------------
  // Window helpers — scans frames for routing player input.
  // ---------------------------------------------------------------------------

  /**
   * Hand -> instance zone: the whole of paying a card into an open window.
   *
   * Called by the two REACTIONS and by nothing else — it is their half of what
   * `playMagic` / `playItem` / `playHero` do for an action. Silent: the
   * reaction announces the play itself (`ModifierPlayed`, `ChallengePlayed`).
   *
   * It takes no frame, because it writes nothing about one. The card's
   * POSITION is the record that it was spent — it is in play for as long as
   * the window is open, the table can see what is riding on the roll, and
   * `abilitySources` finds the card's own entry there. Settlement works out
   * what was spent by comparing the zone with the frame's own "before"
   * picture; see `spentInto`.
   *
   * Telling the window is part of the same act, and belongs here rather than
   * in the callers: the bonus now arrives from the card's own entry a choice
   * or two later, so the window has to be told at the SPEND that somebody is
   * still acting, or it lapses. A reaction that had to reach for the window
   * to say so would be holding one for no other reason.
   */
  spendCard(playerId: string, cardId: string): void {
    this.getPlayer(playerId)?.removeFromHand(cardId)
    this.getParty(playerId).addInstanceCard(cardId)
    this.findOpenModifiableWindow()?.window.cardSpent()
  }

  getFrameByWindowId(
    windowId: string,
  ): { frameId: string; frame: GameFrame } | undefined {
    for (const [frameId, frame] of this.frames) {
      if (frame.windows.some((w) => w.getId() === windowId)) return { frameId, frame }
    }
    return undefined
  }

  /**
   * The open window a bonus can go into — a plain roll or a challenge.
   *
   * PRIVATE, and the three methods below are the whole of what the rest of the
   * engine may ask about it. Handing a window out would make every caller
   * depend on this shape and on the wire format a submission takes; asking a
   * question instead leaves both free to change.
   *
   * OPEN means open: a window that has resolved is skipped even while its
   * frame is briefly still there, which it is between `resolve` setting the
   * flag and the release that follows its first emission.
   */
  private findOpenModifiableWindow():
    | { frameId: string; window: IModifiableWindow }
    | undefined {
    for (const type of [
      ReactionWindowType.Modifier,
      ReactionWindowType.Attack,
      ReactionWindowType.Challenge,
    ]) {
      const entry = this.getFrameByWindowType(type)
      const window = entry?.frame.windows.find((w) => w.getType() === type)
      if (entry && window && window.isOpen() && isModifiable(window)) {
        return { frameId: entry.frameId, window }
      }
    }
    return undefined
  }

  /**
   * Whether a bonus aimed at `targetPlayerId` belongs in the window that is
   * open — no window at all and the answer is simply no.
   *
   * The two halves of playing a modifier both ask it: the reaction, to refuse
   * a card the window would not take while it is still in hand, and its own
   * guard before spending. Asked of the board because that is what holds the
   * windows; a caller that had to fetch one to ask would be holding a window
   * for no other reason.
   */
  acceptsModifierFor(targetPlayerId: string): boolean {
    return (
      this.findOpenModifiableWindow()?.window.acceptsModifierFor(
        targetPlayerId,
      ) ?? false
    )
  }

  /**
   * Land a bonus in the window that is open.
   *
   * Does nothing when there is nothing to land it in, or when that window
   * would refuse the target. A card whose value arrives after its roll has
   * settled is simply late — it was spent when it was played, and there is
   * nothing to undo.
   *
   * The wire format stays in here with the windows: `ChallengeWindow` takes
   * challenges and modifiers through one method, so the kind has to be named,
   * and no caller should have to know that.
   */
  applyModifier(
    playerId: string,
    bonus: { value: number; cardId: string; targetPlayerId: string },
  ): void {
    const open = this.findOpenModifiableWindow()
    if (!open?.window.acceptsModifierFor(bonus.targetPlayerId)) return

    open.window.submitReaction(playerId, { type: 'modifier', ...bonus })
  }

  /**
   * Which way an unanswered value choice should fall, for a bonus `playerId`
   * aimed at `targetPlayerId`. Absent when no window is open to have a rule.
   */
  valueBiasFor(
    playerId: string,
    targetPlayerId: string,
  ): ValueBias | undefined {
    return this.findOpenModifiableWindow()?.window.valueBiasFor(
      playerId,
      targetPlayerId,
    )
  }

  getFrameByWindowType(
    type: import('shared').ReactionWindowType,
  ): { frameId: string; frame: GameFrame } | undefined {
    for (const [frameId, frame] of this.frames) {
      if (frame.windows.some((w) => w.getType() === type)) return { frameId, frame }
    }
    return undefined
  }

  /** True while any frame has an open window — used by TurnManager.drain(). */
  hasOpenFrames(): boolean {
    for (const frame of this.frames.values()) {
      if (frame.windows.some((w) => w.isOpen())) return true
    }
    return false
  }

  // ---------------------------------------------------------------------------
  // Deep clone
  // ---------------------------------------------------------------------------

  clone(): GameState {
    const copy = new GameState(
      this.mainDeck.clone(),
      this.discardPile.clone(),
      this.monsterDeck.clone(),
      this.monsterPile.clone(),
    )
    for (const [id, player] of this.players)
      copy.players.set(id, player.clone())
    for (const [id, party] of this.parties) copy.parties.set(id, party.clone())
    copy.cards = this.cards
    copy.currentPlayerId = this.currentPlayerId
    copy.abilitiesUsedThisTurn = [...this.abilitiesUsedThisTurn]
    copy.cardsChallengedThisTurn = [...this.cardsChallengedThisTurn]
    copy.actionQueue = [...this.actionQueue]
    // Copied, not shared: the live stack consumes steps and marks pipelines as
    // it goes, and none of that may leak into a snapshot. `ctx` stays shared —
    // it is the memory of one run, not part of the board.
    copy.abilityPipelines = this.abilityPipelines.map((pipeline) => ({
      ...pipeline,
      steps: [...pipeline.steps],
    }))
    // Installed abilities and effects ride along inside Player.clone() above.
    // Frames: shallow-copy entries. The snapshot inside each frame is already a
    // complete GameState root — we reference it without recursing into it.
    for (const [id, frame] of this.frames) copy.frames.set(id, frame)
    return copy
  }

  private copyFrom(src: GameState): void {
    this.players = src.players
    this.parties = src.parties
    this.cards = src.cards
    this.currentPlayerId = src.currentPlayerId
    this.abilitiesUsedThisTurn = src.abilitiesUsedThisTurn
    this.cardsChallengedThisTurn = src.cardsChallengedThisTurn
    this.mainDeck = src.mainDeck
    this.discardPile = src.discardPile
    this.monsterDeck = src.monsterDeck
    this.monsterPile = src.monsterPile
    this.actionQueue = src.actionQueue
    this.abilityPipelines = src.abilityPipelines
    this.frames = src.frames // outer frames survive; restored frame entry is gone
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerPlayer(player: Player): void {
    this.players.set(player.getId(), player)
  }
  registerParty(party: Party): void {
    this.parties.set(party.getPlayerId(), party)
  }
  registerCard(card: ICard): void {
    this.cards.set(card.getId(), card)
  }

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId)
  }
  getPlayers(): Player[] {
    return Array.from(this.players.values())
  }

  // ---------------------------------------------------------------------------
  // Parties
  // ---------------------------------------------------------------------------

  getParty(playerId: string): Party {
    const party = this.parties.get(playerId)
    if (!party) throw new Error(`Party not found for player ${playerId}`)
    return party
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------

  getCard(cardId: string): ICard | undefined {
    return this.cards.get(cardId)
  }

  /** What `heroId` is carrying, from the party it stands in. */
  getEquippedItem(heroId: string): string | undefined {
    for (const party of this.parties.values()) {
      if (party.getHeroIds().includes(heroId)) {
        return party.getEquippedItem(heroId)
      }
    }
    return undefined
  }

  /** Which hero carries `itemId`, or nothing once it has left play. */
  getItemCarrier(itemId: string): string | undefined {
    for (const party of this.parties.values()) {
      for (const heroId of party.getHeroIds()) {
        if (party.getEquippedItem(heroId) === itemId) return heroId
      }
    }
    return undefined
  }

  getCardOwner(cardId: string): string | undefined {
    for (const [playerId, player] of this.players) {
      if (player.getHand().includes(cardId)) return playerId
      const party = this.parties.get(playerId)
      if (
        party &&
        (party.getHeroIds().includes(cardId) || party.getLeaderId() === cardId)
      ) {
        return playerId
      }
    }
    return undefined
  }

  getAllActiveCards(): string[] {
    const result: string[] = []
    for (const party of this.parties.values()) {
      result.push(party.getLeaderId())
      result.push(...party.getHeroIds())
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Decks & piles
  // ---------------------------------------------------------------------------

  getMainDeck(): CardStack {
    return this.mainDeck
  }
  getDiscardPile(): CardPile {
    return this.discardPile
  }
  /** The face-up row. Every monster a player may attack is one of these. */
  getMonsterPile(): CardPile {
    return this.monsterPile
  }
  /** Face down, and drawn from only to refill the pile — see slayMonster. */
  getMonsterDeck(): CardStack {
    return this.monsterDeck
  }

  /**
   * Move a monster out of the face-up row and into the winner's party, then
   * turn the next one up behind it.
   *
   * The whole of slaying, in one place, because the three parts are one act:
   * the row is what a player attacks FROM, so it cannot be left one short.
   * A caller that only removed the monster would silently shrink the game.
   *
   * THROWS on a monster that is not in the pile. Both wrappers of the attack
   * check the pile before they roll — the action in `canExecute`, the task
   * when it discovers its target — so arriving here with anything else is an
   * engine mistake, not an illegal request, and it fails where the mistake was
   * made (§11.2).
   *
   * An exhausted monster deck simply leaves the row shorter: nothing to draw
   * is "ran and produced nothing", not a mis-declaration.
   *
   * Announces, for the reason `Party.addHero` does — a card changing zones
   * cannot do it silently, and one choke point that emits is what stops the
   * next mechanic that slays a monster from forgetting to.
   */
  slayMonster(cardId: string, playerId: string, em: IGameEventEmitter): void {
    if (this.monsterPile.pick(cardId) === null) {
      throw new Error(
        `slayMonster: ${cardId} is not in the monster pile — a monster can ` +
          'only be slain from the face-up row.',
      )
    }

    const next = this.monsterDeck.draw()
    if (next) this.monsterPile.add(next)

    this.getParty(playerId).addMonster(cardId)
    em.emit(GameEventFactory.monsterSlain(playerId, cardId))
  }

  // ---------------------------------------------------------------------------
  // Turn state
  // ---------------------------------------------------------------------------

  getCurrentPlayerId(): string | undefined {
    return this.currentPlayerId
  }
  setCurrentPlayerId(id: string): void {
    this.currentPlayerId = id
  }

  getAbilitiesUsedThisTurn(): string[] {
    return [...this.abilitiesUsedThisTurn]
  }
  markAbilityUsed(cardId: string): void {
    this.abilitiesUsedThisTurn.push(cardId)
  }
  clearUsedAbilities(): void {
    this.abilitiesUsedThisTurn = []
  }

  // ---------------------------------------------------------------------------
  // Ongoing effects — stored on Player; these are the cross-player views.
  // Expiry is TaskManager's call, using the rules in abilities/expiries.ts.
  // ---------------------------------------------------------------------------

  /** Routes to the owning player named by the effect itself. */
  addEffect(effect: IEffect): void {
    const player = this.players.get(effect.ownerId)
    if (!player) {
      throw new Error(
        `addEffect: no player ${effect.ownerId} — an effect must be installed ` +
          'on a seated player, or nothing will ever sweep or fire it.',
      )
    }
    player.addEffect(effect)
  }

  /** True while `playerId` is under an effect carrying the given passive flag. */
  hasEffect(type: PassiveType, playerId: string): boolean {
    return this.players.get(playerId)?.hasEffect(type) ?? false
  }

  /**
   * Every effect of this type on `playerId` that applies to the roll being
   * asked about — which card it is on, and what kind of roll it is.
   *
   * Two narrowings, one rule: an effect that names neither applies to
   * everything, and one that names either applies only when the caller asks
   * about that. Asking about nothing — a challenge roll is not a roll on a
   * hero — therefore leaves the scoped ones OUT rather than letting them in.
   */
  getEffects(
    type: PassiveType,
    playerId: string,
    cardId?: string,
    rollContext?: RollContext,
  ): IEffect[] {
    const effects = this.players.get(playerId)?.getEffects(type) ?? []
    return effects.filter(
      (effect) =>
        (!effect.cardId || effect.cardId === cardId) &&
        (!effect.rollContext || effect.rollContext === rollContext),
    )
  }


  getCardsChallengedThisTurn(): string[] {
    return [...this.cardsChallengedThisTurn]
  }
  markCardChallenged(cardId: string): void {
    this.cardsChallengedThisTurn.push(cardId)
  }
  clearChallengedCards(): void {
    this.cardsChallengedThisTurn = []
  }
}
