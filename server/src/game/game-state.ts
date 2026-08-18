import { ICard } from 'shared'
import type { ActiveEffect, IAction, IReactionWindow, ITask } from './interfaces'
import type { PassiveType } from 'shared'
import { Player } from './player'
import { Party } from './party'
import { CardStack } from './card-stack'
import { HeroCard } from './cards/hero-card'
import { ItemCard } from './cards/item-card'
import { CardPile } from './card-pile'
import type { AbilityContext } from './ability-context'

// ---------------------------------------------------------------------------
// GameFrame — snapshot taken just before the frame was opened, plus any
// reaction windows the caller inserted. Released on success, restored on rollback.
// ---------------------------------------------------------------------------

export type GameFrame = {
  snapshot: GameState
  windows: IReactionWindow[]
}

// ---------------------------------------------------------------------------
// AbilityPipeline — a suspended ability pipeline waiting on a frame.
// ---------------------------------------------------------------------------

export type AbilityPipeline = {
  steps: ITask[]
  ctx: AbilityContext
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

  /** Suspended ability pipelines keyed by frameId. */
  abilityPipelines: Map<string, AbilityPipeline> = new Map()

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
    copy.abilityPipelines = new Map(this.abilityPipelines)
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

  getEquippedItem(heroId: string): string | undefined {
    const card = this.cards.get(heroId)
    if (card instanceof HeroCard) return card.getEquippedItem() ?? undefined
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
  // Installed abilities & ongoing effects
  //
  // The records live on their owning Player — ownership is structural. These are
  // the cross-player views. WHEN an entry dies is AbilityProcessor's call
  // (effects.ts holds the rules); storage is the player's.
  // ---------------------------------------------------------------------------

  /** Routes to the owning player named by the effect itself. */
  addEffect(effect: ActiveEffect): void {
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
   * Every effect on `playerId` carrying this passive. `PassiveType.RollBonus`
   * had no reader at all until this: hasEffect answers "is there a bonus" and
   * drops both the amount and the card it came from.
   */
  getEffectsWithPassive(type: PassiveType, playerId: string): ActiveEffect[] {
    return this.players.get(playerId)?.getEffectsWithPassive(type) ?? []
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
