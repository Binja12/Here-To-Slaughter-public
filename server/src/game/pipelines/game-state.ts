import { accepted, refused } from '../interfaces'
import {
  GamePhase,
  HeroClass,
  ICard,
  IGameEventEmitter,
  ReactionWindowType,
  RefusalReason,
  RequestResult,
} from 'shared'
import type {
  IEffect,
  IAction,
  IModifiableWindow,
  IReactionWindow,
  ITask,
  RollBonus,
  ValueBias,
} from '../interfaces'
import { PassiveType } from 'shared'
import type { RollContext } from 'shared'
import { Player } from '../state-structures/player'
import { Party, HeroAddReason, HeroRemovalReason } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import { HeroCard } from '../cards/hero-card'
import { ItemCard } from '../cards/item-card'
import { MonsterCard } from '../cards/monster-card'
import type { AbilityContext } from '../abilities/ability-context'
// Value import, not type-only: slayMonster announces. No cycle — the factory
// reaches only shared, game-event.ts and ability-context.ts.
import { GameEventFactory } from '../events/game-event-factory'
import { PartyLeaderCard } from '../cards/party-leader-card'

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

/** The windows whose settlement may still restore their frame (§3). */
const RESTORING_WINDOWS: ReadonlySet<ReactionWindowType> = new Set([
  ReactionWindowType.Challenge,
  ReactionWindowType.Modifier,
  ReactionWindowType.Attack,
])

/**
 * Everything a rollback goes back to: the board, and the pipeline stack as
 * it stood when the frame opened, separately owned (steps copied, contexts
 * cloned). The pipeline that parks on this frame is marked in `pipelines`
 * by `parkOn`. Everything pushed after the snapshot is work done after it,
 * and goes with the board it changed (§3).
 */
export type FrameSnapshot = {
  board: GameState
  pipelines: AbilityPipeline[]
}

export type GameFrame = {
  snapshot: FrameSnapshot
  windows: IReactionWindow[]
}

/**
 * At the end of a turn every open window's clock is shortened to this, so
 * the next turn is not held long by reactions nobody is making (§11).
 */
export const TURN_END_WINDOW_CAP_MS = 10_000

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
  private gamePhase: GamePhase = GamePhase.Setup
  private winnerId?: string
  private abilitiesUsedThisTurn: string[] = []
  /**
   * Cards shown to a seat right now, by seat — RevealTask puts them here and
   * takes them off when its clock runs out. Read by the view as
   * `revealedCards`; the client decides how to show them.
   */
  private revealed: Map<string, string[]> = new Map()
  private cardsChallengedThisTurn: string[] = []

  /**
   * Ability pipelines, newest on top; TaskManager works on the top one. Here
   * rather than on TaskManager so a frame's rollback can drop the ones pushed
   * after its snapshot (revert).
   */
  private abilityPipelines: AbilityPipeline[] = []

  /** Open reaction frames, in the order they opened. */
  private frames: Map<string, GameFrame> = new Map()

  constructor(
    private mainDeck: CardStack,
    private discardPile: CardPile,
    private monsterDeck: CardStack,
    private monsterPile: CardPile,
    /** `GameConfig.seamlessReactions`: optimistic frames, plays under open windows (§3). */
    private readonly seamless = false,
  ) {}

  isSeamless(): boolean {
    return this.seamless
  }

  // ---------------------------------------------------------------------------
  // Frame API
  // ---------------------------------------------------------------------------

  getFrames(): ReadonlyMap<string, GameFrame> {
    return this.frames
  }

  /** Nothing happens for a frame that is not open. */
  addWindow(frameId: string, window: IReactionWindow): void {
    this.frames.get(frameId)?.windows.push(window)
  }

  getPipelines(): readonly AbilityPipeline[] {
    return this.abilityPipelines
  }

  pushPipeline(pipeline: AbilityPipeline): void {
    this.abilityPipelines.push(pipeline)
  }

  popPipeline(): AbilityPipeline | undefined {
    return this.abilityPipelines.pop()
  }

  /** Opens a frame over `board` (a clone taken by the caller, before the play's effect) with the stack as it stands now. */
  addFrame(frameId: string, board: GameState, windows: IReactionWindow[] = []): void {
    this.frames.set(frameId, {
      snapshot: { board, pipelines: copyPipelines(this.abilityPipelines, this.frames) },
      windows,
    })
  }

  /**
   * Parks `pipeline` on `frameId`, live and in the frame's own copy of the
   * stack, so a rollback that keeps the frame (`revertFrame`) finds the
   * continuation still waiting for the frame's next resolution, and one
   * that closes it (`restoreFrame`) knows which pipeline to drop. The copy
   * was taken while this pipeline was running, so it sits at the same
   * index in both.
   */
  parkOn(pipeline: AbilityPipeline, frameId: string): void {
    pipeline.pausedOn = frameId
    const index = this.abilityPipelines.indexOf(pipeline)
    const copy = this.frames.get(frameId)?.snapshot.pipelines[index]
    if (copy) copy.pausedOn = frameId
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
   * Rollback, frame gone: the failed outcome of a window (a roll under its
   * requirement, a lost challenge). What was thrown into the window is
   * spent whichever way it went.
   */
  restoreFrame(frameId: string): void {
    const frame = this.frames.get(frameId)
    if (!frame) return
    this.revert(frameId, frame, false)
  }

  /**
   * Rollback, frame KEPT: the window stays open and its snapshot stays
   * valid, so the same frame can roll back again when the outcome flips
   * back (optimistic frames, §3). The board is restored from a COPY of the
   * snapshot for that reason — the live board must never alias it.
   */
  revertFrame(frameId: string): void {
    const frame = this.frames.get(frameId)
    if (!frame) return
    this.revert(frameId, frame, true)
    this.frames.set(frameId, frame)
  }

  /**
   * The one rollback. Everything after the snapshot is undone: the board
   * goes back to the snapshot, the stack to the frame's copy of it — with
   * the pipeline parked on this frame kept waiting (`keepWaiting`, a frame
   * that stays open) or dropped (a frame that failed) — and the frames
   * opened since are cancelled, their windows closing without an outcome
   * AFTER the board is whole again, because a close is announced and an
   * announcement drains. Spent cards are read BEFORE the swap: restoring is
   * what erases the evidence.
   */
  private revert(frameId: string, frame: GameFrame, keepWaiting: boolean): void {
    const spent = this.spentInto(frame)
    const later = this.closeFramesAfter(frameId)
    // Copied while this frame is still held, so the mark on the pipeline
    // parked on it survives the copy and can be kept or dropped by name.
    this.abilityPipelines = copyPipelines(frame.snapshot.pipelines, this.frames).filter(
      (p) => keepWaiting || p.pausedOn !== frameId,
    )
    this.frames.delete(frameId)
    this.copyFrom(frame.snapshot.board.clone())

    // The snapshot handed them back to their owners' hands. Spent is spent,
    // whichever way the window went.
    for (const { cardId, playerId } of spent) {
      this.players.get(playerId)?.removeFromHand(cardId)
      this.discardPile.add(cardId)
    }

    for (const window of later) window.cancel()
  }

  /**
   * The frames after `frameId` are later work: their entries go now, their
   * open windows are handed back to be cancelled once the board is whole.
   * Held in the order they opened, so "after" is a position.
   */
  private closeFramesAfter(frameId: string): IReactionWindow[] {
    const later: IReactionWindow[] = []
    let after = false
    for (const [id, frame] of [...this.frames]) {
      if (after) {
        later.push(...frame.windows.filter((w) => w.isOpen()))
        this.frames.delete(id)
      }
      if (id === frameId) after = true
    }
    return later
  }

  /**
   * Whether an action from `playerId` would be refused right now, the turn
   * aside. The one answer `TurnManager.enqueue`, its drain, the turn clock
   * and `PlayerView.acceptsActions` all read.
   *
   * Without seamless reactions the board takes nothing mid-resolution. With
   * them the player plays on under open windows and is refused only while
   * a modifier or a challenge is being RESOLVED — a value being chosen, a
   * contest running — while their own attack is being rolled (the one play
   * that waits, AttackWindow.optimistic), or while a question of their own
   * stands that is not theirs to skip (an optional one is forfeited by the
   * action instead).
   */
  refusesActions(playerId: string): boolean {
    if (!this.seamless) return this.isBusy()
    return this.openWindows().some((window) => window.blocksActions(playerId))
  }

  /** The open questions `playerId` may walk away from — forfeited by their next action under seamless reactions. */
  optionalQuestionsFor(playerId: string): IReactionWindow[] {
    return this.openWindows().filter(
      (window) => window.getRespondentId() === playerId && window.isOptional(),
    )
  }

  /**
   * A roll or challenge window's clock as the turn allows: once the active
   * player's budget is gone under seamless reactions AND no question stands
   * open, no such window runs longer than TURN_END_WINDOW_CAP_MS, so the
   * next turn is not held for reactions nobody is making (§11). While a
   * question stands — anyone's — the table is still being asked something
   * and the reactions to the play keep their full clocks; TurnManager.drain
   * caps them when the last question settles. Questions themselves are never
   * capped (ChoiceWindow).
   */
  cappedClock(ms: number): number {
    return this.turnEnding() ? Math.min(ms, TURN_END_WINDOW_CAP_MS) : ms
  }

  /** The active player's budget is gone and nobody is being asked anything: the reactions are all that hold the turn. */
  turnEnding(): boolean {
    const playerId = this.currentPlayerId
    return (
      this.seamless &&
      playerId !== undefined &&
      (this.players.get(playerId)?.getActionPoints() ?? 0) <= 0 &&
      !this.hasOpenQuestions()
    )
  }

  /** A question — any open window that is not a challenge, hero roll or attack — stands for somebody. */
  hasOpenQuestions(): boolean {
    return this.openWindows().some((w) => !RESTORING_WINDOWS.has(w.getType()))
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
        frame.snapshot.board.parties.get(playerId)?.getInstanceCardIds() ?? [],
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
  spendCard(playerId: string, cardId: string, targetPlayerId?: string): void {
    this.getPlayer(playerId)?.removeFromHand(cardId)
    this.getParty(playerId).addInstanceCard(cardId)
    this.findOpenModifiableWindow(targetPlayerId)?.window.cardSpent()
  }

  /** The frame contesting `cardId`, while its challenge window is open. */
  getFrameContesting(
    cardId: string,
  ): { frameId: string; frame: GameFrame } | undefined {
    for (const [frameId, frame] of this.frames) {
      const contest = frame.windows.find(
        (w) => w.getType() === ReactionWindowType.Challenge && w.isOpen(),
      )
      if (contest?.subjectCardId?.() === cardId) return { frameId, frame }
    }
    return undefined
  }

  getFrameByWindowId(
    windowId: string,
  ): { frameId: string; frame: GameFrame } | undefined {
    for (const [frameId, frame] of this.frames) {
      if (frame.windows.some((w) => w.getId() === windowId))
        return { frameId, frame }
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
   *
   * Under seamless reactions several may be open at once, so the NEWEST one
   * that takes a bonus for `targetPlayerId` is the one meant; without a
   * target, or when none takes it, the newest of them answers for itself.
   */
  private findOpenModifiableWindow(
    targetPlayerId?: string,
  ): { frameId: string; window: IModifiableWindow } | undefined {
    const open: { frameId: string; window: IModifiableWindow }[] = []
    for (const [frameId, frame] of this.frames) {
      for (const window of frame.windows) {
        if (window.isOpen() && isModifiable(window)) open.push({ frameId, window })
      }
    }
    open.reverse()
    if (targetPlayerId !== undefined) {
      const takes = open.find(
        (entry) => entry.window.acceptsModifierFor(targetPlayerId).accepted,
      )
      if (takes) return takes
    }
    return open[0]
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
  acceptsModifierFor(targetPlayerId: string): RequestResult {
    const open = this.findOpenModifiableWindow(targetPlayerId)
    if (!open) return refused(RefusalReason.NoModifiableWindow)
    return open.window.acceptsModifierFor(targetPlayerId)
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
    const open = this.findOpenModifiableWindow(bonus.targetPlayerId)
    if (!open?.window.acceptsModifierFor(bonus.targetPlayerId).accepted) return

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
    return this.findOpenModifiableWindow(targetPlayerId)?.window.valueBiasFor(
      playerId,
      targetPlayerId,
    )
  }

  getFrameByWindowType(
    type: import('shared').ReactionWindowType,
  ): { frameId: string; frame: GameFrame } | undefined {
    for (const [frameId, frame] of this.frames) {
      if (frame.windows.some((w) => w.getType() === type))
        return { frameId, frame }
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

  /**
   * Whether a frame may still restore the board: one holding an open
   * challenge, hero roll or attack, or one with nothing open yet (between
   * openFrame and its first window, or between a window's close and its
   * settle). Choice windows never restore. GameEngine reads this before it
   * asks the win conditions.
   */
  hasPendingOutcome(): boolean {
    for (const frame of this.frames.values()) {
      const open = frame.windows.filter((w) => w.isOpen())
      if (open.length === 0) return true
      if (open.some((w) => RESTORING_WINDOWS.has(w.getType()))) return true
    }
    return false
  }

  /** Every open window on the table, in no particular order. */
  openWindows(): IReactionWindow[] {
    const open: IReactionWindow[] = []
    for (const frame of this.frames.values()) {
      open.push(...frame.windows.filter((w) => w.isOpen()))
    }
    return open
  }

  /**
   * True while a window is open or an ability still has steps to run.
   *
   * The STACK as well as the frames: a window releases its frame before it
   * announces the outcome (§4), so between the two there is no open frame and
   * the paused pipeline has not woken yet.
   */
  isBusy(): boolean {
    return this.hasOpenFrames() || this.abilityPipelines.length > 0
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
      this.seamless,
    )
    for (const [id, player] of this.players)
      copy.players.set(id, player.clone())
    for (const [id, party] of this.parties) copy.parties.set(id, party.clone())
    copy.cards = this.cards
    copy.currentPlayerId = this.currentPlayerId
    copy.gamePhase = this.gamePhase
    copy.winnerId = this.winnerId
    copy.abilitiesUsedThisTurn = [...this.abilitiesUsedThisTurn]
    copy.cardsChallengedThisTurn = [...this.cardsChallengedThisTurn]
    for (const [id, ids] of this.revealed) copy.revealed.set(id, [...ids])
    // Not the pipeline stack: it is work in progress ON the board, not the
    // board. A rollback undoes what that work did and drops what was waiting
    // on the frame (restoreFrame); it does not forget the work existed.
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
    this.gamePhase = src.gamePhase
    this.winnerId = src.winnerId
    this.abilitiesUsedThisTurn = src.abilitiesUsedThisTurn
    this.cardsChallengedThisTurn = src.cardsChallengedThisTurn
    this.mainDeck = src.mainDeck
    this.discardPile = src.discardPile
    this.monsterDeck = src.monsterDeck
    this.monsterPile = src.monsterPile
    // NOT the frames. The live map already holds exactly the outer frames
    // (`revert` removed the restored one and everything after it), and a
    // frame that settled since the snapshot must stay settled — the
    // snapshot's own map would bring it back closed, and a closed frame
    // reads as an outcome still pending, for ever (hasPendingOutcome).
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

  /**
   * THROWS on an id the table never seated. A player id reaches the engine
   * from the transport, which bound it at the handshake — so one that is not
   * here is an engine mistake, never a refusal (§11.2).
   */
  requirePlayer(playerId: string): Player {
    const player = this.players.get(playerId)
    if (!player) {
      throw new Error(`${playerId} is not seated at this game`)
    }
    return player
  }

  // An action asks the BOARD about its player and never holds a `Player`, so
  // it depends on GameState alone. Each of these throws on an unseated id.

  getActionPoints(playerId: string): number {
    return this.requirePlayer(playerId).getActionPoints()
  }

  decreaseActionPoints(playerId: string, amount: number): void {
    this.requirePlayer(playerId).decreaseActionPoints(amount)
  }

  hasInHand(playerId: string, cardId: string): boolean {
    return this.requirePlayer(playerId).getHand().includes(cardId)
  }

  getHandSize(playerId: string): number {
    return this.requirePlayer(playerId).getHandSize()
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
  /**
   * Takes the gear off a hero who stays in play and returns it — the ONE way
   * an item comes off outside of the hero leaving (Party.removeHero carries it
   * along). Silent, like Party.unequipItem: the caller announces ItemUnequipped
   * and decides where the item goes. Nothing to take off = undefined.
   */
  unequipItem(heroId: string): string | undefined {
    const ownerId = this.getCardOwner(heroId)
    if (!ownerId) return undefined
    return this.getParty(ownerId).unequipItem(heroId)
  }

  /**
   * Puts an item on a hero standing in a party. Silent, the mirror of
   * unequipItem: the caller announces ItemEquippedToHero and has already
   * taken the item out of wherever it was. A hero in no party = nothing done.
   */
  equipItem(heroId: string, itemId: string): void {
    const ownerId = this.getCardOwner(heroId)
    if (!ownerId) return
    this.getParty(ownerId).equipItem(heroId, itemId)
  }

  // ---------------------------------------------------------------------------
  // The board's doors. NOTHING outside this class calls a mutator on a Player,
  // a Party or a pile (the owner, 2026-09-04): each door is the structure's own
  // method, one to one, reached through the board. Composition stays with the
  // caller — a pull is a removeFromHand then an addToHand, spelled out where
  // it happens. The doors are silent; announcing is the caller's business,
  // except where the structure announces on its own (Party.addHero /
  // removeHero emit the canonical membership events).
  // ---------------------------------------------------------------------------

  /** Player.addToHand, through the board. */
  addToHand(playerId: string, cardId: string): void {
    this.requirePlayer(playerId).addToHand(cardId)
  }

  /** Player.removeFromHand, through the board. */
  removeFromHand(playerId: string, cardId: string): void {
    this.requirePlayer(playerId).removeFromHand(cardId)
  }

  /** CardPile.add on the discard pile, through the board. */
  addToDiscardPile(cardId: string): void {
    this.discardPile.add(cardId)
  }

  /** CardPile.pick on the discard pile, through the board. Null when not there. */
  pickFromDiscardPile(cardId: string): string | null {
    return this.discardPile.pick(cardId)
  }

  /**
   * A hero out of a party. Returns the gear it was wearing, for the caller to
   * put somewhere. Party.removeHero announces HeroRemovedFromParty itself.
   */
  removeHero(
    playerId: string,
    heroId: string,
    em: IGameEventEmitter,
    reason: HeroRemovalReason,
  ): string | undefined {
    return this.getParty(playerId).removeHero(heroId, em, reason)
  }

  /** A hero into a party, its gear along with it. Party.addHero announces HeroAddedToParty itself. */
  addHero(
    playerId: string,
    heroId: string,
    em: IGameEventEmitter,
    reason: HeroAddReason,
    carriedItemId?: string,
  ): void {
    this.getParty(playerId).addHero(heroId, em, reason, carriedItemId)
  }

  /** Party.addInstanceCard, through the board. */
  addInstanceCard(playerId: string, cardId: string): void {
    this.getParty(playerId).addInstanceCard(cardId)
  }

  /** Party.removeInstanceCard, through the board. */
  removeInstanceCard(playerId: string, cardId: string): void {
    this.getParty(playerId).removeInstanceCard(cardId)
  }

  /** Player.increaseActionPoints, through the board. */
  increaseActionPoints(playerId: string, amount: number): void {
    this.requirePlayer(playerId).increaseActionPoints(amount)
  }

  /** Player.removeEffect, through the board. */
  removeEffect(playerId: string, effectId: string): void {
    this.requirePlayer(playerId).removeEffect(effectId)
  }

  /** Show cards to a seat: onto its `revealedCards` until hideRevealed. */
  revealTo(playerId: string, cardIds: string[]): void {
    const current = this.revealed.get(playerId) ?? []
    this.revealed.set(playerId, [
      ...current,
      ...cardIds.filter((id) => !current.includes(id)),
    ])
  }

  /** The reveal is over: those cards come off the seat's view. */
  hideRevealed(playerId: string, cardIds: string[]): void {
    const left = (this.revealed.get(playerId) ?? []).filter(
      (id) => !cardIds.includes(id),
    )
    if (left.length) this.revealed.set(playerId, left)
    else this.revealed.delete(playerId)
  }

  getRevealed(playerId: string): string[] {
    return [...(this.revealed.get(playerId) ?? [])]
  }

  /** CardStack.peek on the main deck, through the board. */
  peekMainDeck(n: number): string[] {
    return this.mainDeck.peek(n)
  }

  /** CardStack.pick on the main deck, through the board. Null when not there. */
  pickFromMainDeck(cardId: string): string | null {
    return this.mainDeck.pick(cardId)
  }



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

  /**
   * The only way a card leaves the main deck. Once the last card is taken the
   * whole discard pile is shuffled in behind it, so the deck is never left at
   * zero while there is anything to refill it with. Null only when both are
   * empty.
   */
  drawFromMainDeck(): string | null {
    const cardId = this.mainDeck.draw()
    if (this.mainDeck.getSize() === 0) {
      for (const discarded of [...this.discardPile.getAll()]) {
        this.discardPile.pick(discarded)
        this.mainDeck.addToBottom(discarded)
      }
      this.mainDeck.shuffle()
    }
    return cardId
  }

  /**
   * Deck → hand, announced. Null when there was nothing to draw; nothing is
   * announced then.
   */
  drawIntoHand(playerId: string, em: IGameEventEmitter): string | null {
    const player = this.getPlayer(playerId)
    if (!player) return null
    const cardId = this.drawFromMainDeck()
    if (!cardId) return null
    player.addToHand(cardId)
    em.emit(GameEventFactory.cardDrawn(playerId, cardId))
    return cardId
  }

  /**
   * A NAMED card out of the deck into a hand, announced as a draw — a card
   * the player looked at and chose (Bullseye). The rest of the deck stays as
   * it was; the queue closes over the gap by itself. Null when the card is
   * not in the deck.
   */
  drawNamedIntoHand(
    playerId: string,
    cardId: string,
    em: IGameEventEmitter,
  ): string | null {
    const player = this.getPlayer(playerId)
    if (!player) return null
    if (this.mainDeck.pick(cardId) === null) return null
    player.addToHand(cardId)
    em.emit(GameEventFactory.cardDrawn(playerId, cardId))
    return cardId
  }

  /**
   * Hand → discard, announced. THROWS on a card the player is not holding:
   * every caller asks first, so reaching here with a card that is elsewhere
   * is an engine mistake, not an illegal request.
   */
  discardFromHand(
    playerId: string,
    cardId: string,
    em: IGameEventEmitter,
  ): void {
    const player = this.getPlayer(playerId)
    if (!player?.getHand().includes(cardId)) {
      throw new Error(
        `discardFromHand: ${cardId} is not in ${playerId}'s hand.`,
      )
    }
    player.removeFromHand(cardId)
    this.discardPile.add(cardId)
    em.emit(GameEventFactory.cardDiscarded(playerId, cardId))
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
   * Whether `playerId` may attack `monsterId` right now — the whole of the
   * legality question, asked in four places: the action's `canExecute`, the
   * task when it discovers its target, the choice filter that builds the
   * options, and `MonsterChoiceWindow.canSubmit`. One question with one
   * answer, so a monster cannot be offered by one and refused by another.
   *
   * Two halves. It must be IN the row — the deck is face down and the party is
   * already won — and the party must field what the monster's `partyReq` asks
   * for. Both are read fresh, because a hero can leave a party while the choice
   * window is open.
   */
  canAttackMonster(playerId: string, monsterId: string): RequestResult {
    if (!this.monsterPile.getAll().includes(monsterId)) {
      return refused(RefusalReason.MonsterNotInRow)
    }

    const monster = this.getCard(monsterId)
    if (!(monster instanceof MonsterCard)) {
      return refused(RefusalReason.MonsterNotInRow)
    }

    if (!monster.canBeAttackedBy(this.getHeroClasses(playerId))) {
      return refused(RefusalReason.PartyRequirementUnmet)
    }
    return accepted()
  }

  /**
   * Whether a card `playerId` is playing may be contested at all.
   *
   * The reader for `CantBeChallenged`, narrowed by the effect's `cardTypes` —
   * the Warworn Owlbear (monster-135) protects Items and nothing else, so the
   * card's own type is the question. An effect naming no types covers every
   * type, the same way an absent `rollContext` covers every kind of roll (§7).
   *
   * Asked by ChallengeWindow at construction: the frame still opens and still
   * settles, because a played card's own steps trigger on the settled frame
   * (§1). What changes is that nobody is given time to contest it.
   */
  canBeChallenged(playerId: string, cardId: string): boolean {
    const cardType = this.getCard(cardId)?.getType()
    if (!cardType) return true

    return !this.players
      .get(playerId)
      ?.getEffects(PassiveType.CantBeChallenged)
      .some(
        (effect) => !effect.cardTypes || effect.cardTypes.includes(cardType),
      )
  }

  /**
   * Whether `heroId`'s printed effect may be rolled for at all.
   *
   * The reader for `CantUseHeroEffect` — the Sealing Key (item-076), a cursed
   * item played onto somebody else's hero. Scoped to the carrier at install
   * time (`scopedToCarrier`), so it seals ONE hero rather than every hero its
   * owner fields; asked by both halves of rolling on a hero.
   */
  canUseHeroEffect(playerId: string, heroId: string): boolean {
    return (
      this.getEffects(PassiveType.CantUseHeroEffect, playerId, heroId)
        .length === 0
    )
  }

  /**
   * Whether a hero may be DESTROYED right now — Mighty Blade (hero-031) and
   * Terratuga (monster-130) install `CantBeDestroyed` on the owner. Read
   * against the owner at the moment of the attempt, so a hero that joined
   * after the rule was installed is covered too. Sacrifice is a different
   * mechanic and is not asked here: a fight-back still costs a hero.
   */
  canBeDestroyed(heroId: string): boolean {
    const ownerId = this.getCardOwner(heroId)
    if (!ownerId) return true
    return (
      this.getEffects(PassiveType.CantBeDestroyed, ownerId, heroId).length === 0
    )
  }

  /**
   * The class the BOARD reads for a hero: its default (printed) class, unless the item it
   * wears says otherwise — a class mask (`ItemCardData.heroClass`). Derived
   * from the equipment on every read, so nothing is set on equip and nothing
   * reverted on unequip: the moment the mask comes off, by any route, the
   * default class is back. Every reader of a hero's class comes through here.
   * Undefined for a card that is not a hero.
   */
  getHeroClass(heroId: string): HeroClass | undefined {
    const hero = this.getCard(heroId)
    if (!(hero instanceof HeroCard)) return undefined
    const itemId = this.getEquippedItem(heroId)
    const item = itemId ? this.getCard(itemId) : undefined
    const masked = item instanceof ItemCard ? item.getHeroClass() : undefined
    return masked ?? hero.getDefaultClass()
  }

  /** One class per hero, a mask included. What a monster's `partyReq` is matched against; never the leader's. */
  getHeroClasses(playerId: string): HeroClass[] {
    return this.getParty(playerId)
      .getHeroIds()
      .map((heroId) => this.getHeroClass(heroId))
      .filter((cls): cls is HeroClass => cls !== undefined)
  }

  /** The leader's class, then the heroes'. What the class win and the `hasClass` filter read. */
  getPartyClasses(playerId: string): HeroClass[] {
    const leader = this.getCard(this.getParty(playerId).getLeaderId())
    const heroClasses = this.getHeroClasses(playerId)
    return leader instanceof PartyLeaderCard
      ? [leader.getHeroClass(), ...heroClasses]
      : heroClasses
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

  /** Setup → Turns → Concluded, moved by GameEngine; read by the drain and the view. */
  getGamePhase(): GamePhase {
    return this.gamePhase
  }
  setGamePhase(phase: GamePhase): void {
    this.gamePhase = phase
  }

  /**
   * The last move of the phase: `Concluded`, and who won it. One call, so a
   * concluded board always names its winner — the view shows both, and a
   * screen drawn from a snapshot alone has no `GameEnded` to read it off.
   */
  conclude(winnerId: string): void {
    this.gamePhase = GamePhase.Concluded
    this.winnerId = winnerId
    for (const window of this.openWindows()) window.cancel()
    this.frames.clear()
    this.abilityPipelines = []
  }

  /** Set only by `conclude`; absent while the game is still being played. */
  getWinnerId(): string | undefined {
    return this.winnerId
  }

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

  /**
   * What `targetPlayerId` gets back when `byPlayerId` lands a modifier on one
   * of their rolls — the Abyss Queen (monster-129).
   *
   * Here rather than in a window because it is a question about the BOARD, and
   * because the two window shapes would otherwise each hold a copy: a plain
   * roll has one bonus list, a challenge has two, and only the pushing differs.
   * The guard is what "ANOTHER player" means, and it lives in one place.
   */
  counterBonusesFor(targetPlayerId: string, byPlayerId: string): RollBonus[] {
    if (byPlayerId === targetPlayerId) return []
    return this.getEffects(
      PassiveType.ModifierCounterBonus,
      targetPlayerId,
    ).map((effect) => ({
      cardSource: effect.sourceCardId,
      amount: effect.value ?? 0,
    }))
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

/**
 * A stack separately owned: steps copied, contexts cloned, and a mark for a
 * frame that no longer exists dropped — a confirm's TaskConfirmed goes out
 * before its FrameResolved, so a continuation can open its frame while the
 * offer is still marked paused on a frame already released, and a copy
 * carrying that mark would wait for ever (§3).
 */
function copyPipelines(
  pipelines: readonly AbilityPipeline[],
  frames: ReadonlyMap<string, GameFrame>,
): AbilityPipeline[] {
  return pipelines.map((p) => ({
    steps: [...p.steps],
    ctx: p.ctx.clone(),
    pausedOn: p.pausedOn !== undefined && frames.has(p.pausedOn) ? p.pausedOn : undefined,
    system: p.system,
  }))
}
