import { ICard } from 'shared'
import type { IEffect, IAction, IReactionWindow, ITask } from '../interfaces'
import type { PassiveType } from 'shared'
import { Player } from '../state-structures/player'
import { Party } from '../state-structures/party'
import { CardStack } from '../state-structures/card-stack'
import { CardPile } from '../state-structures/card-pile'
import type { AbilityContext } from '../abilities/ability-context'

// ---------------------------------------------------------------------------
// GameFrame — snapshot taken just before the frame was opened, plus any
// reaction windows the caller inserted. Released on success, restored on rollback.
// ---------------------------------------------------------------------------

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
   * Release a frame after successful resolution. Discards its snapshot.
   */
  releaseFrame(frameId: string): void {
    this.frames.delete(frameId)
  }

  /**
   * Restore from the frame's snapshot then delete the frame.
   * Used when a reaction fails (e.g. modifier roll doesn't meet rollReq, Challenger wins a challenge).
   */
  restoreFrame(frameId: string): void {
    const frame = this.frames.get(frameId)
    if (!frame) return
    this.frames.delete(frameId)
    this.copyFrom(frame.snapshot)
  }

  // ---------------------------------------------------------------------------
  // Window helpers — scans frames for routing player input.
  // ---------------------------------------------------------------------------

  /**
   * Permanently spend a card during a frame — removes it from the current
   * player's hand AND from the snapshot's hand, so rollback doesn't restore it.
   * Also adds it to both discard piles so the card survives either path.
   */
  burnCard(frameId: string, playerId: string, cardId: string): void {
    this.getPlayer(playerId)?.removeFromHand(cardId)
    this.discardPile.add(cardId)

    const snapshot = this.frames.get(frameId)?.snapshot
    if (snapshot) {
      snapshot.getPlayer(playerId)?.removeFromHand(cardId)
      snapshot.getDiscardPile().add(cardId)
    }
  }

  getFrameByWindowId(
    windowId: string,
  ): { frameId: string; frame: GameFrame } | undefined {
    for (const [frameId, frame] of this.frames) {
      if (frame.windows.some((w) => w.getId() === windowId)) return { frameId, frame }
    }
    return undefined
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
  getMonsterPile(): CardPile {
    return this.monsterPile
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
   * Every effect of this type on `playerId` that applies to `cardId`.
   *
   * An unscoped effect applies to everything; one that names a card applies
   * only when the caller is asking about that card. Asking about nothing —
   * a challenge roll is not a roll on a hero — therefore excludes the scoped
   * ones rather than including them.
   */
  getEffects(
    type: PassiveType,
    playerId: string,
    cardId?: string,
  ): IEffect[] {
    const effects = this.players.get(playerId)?.getEffects(type) ?? []
    return effects.filter((effect) => !effect.cardId || effect.cardId === cardId)
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
