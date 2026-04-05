import { GamePhase } from 'shared'
import { GameConfig } from '../config/game-config'
import { Player } from '../../player'
import { Party } from '../../party'
import { CardStack } from '../../card-stack'
import { CardPile } from '../../card-pile'
import { ICardRepository } from 'shared'

export class GameState {
  private mainDeck: CardStack
  private monsterDeck: CardStack
  private leaderDeck: CardStack
  private slayableMonsters: CardPile
  private discardPile: CardPile
  private phase: GamePhase
  private playerTurn?: string
  private abilitiesUsedThisTurn: string[]
  private winnerId?: string
  private snapshotStack: GameState[] = []

  constructor(
    private config: GameConfig,
    private players: Player[],
    private parties: Party[],
    private cardRepo: ICardRepository,
  ) {
    this.mainDeck = new CardStack('main-deck', 'Main Deck')
    this.monsterDeck = new CardStack('monster-deck', 'Monster Deck')
    this.leaderDeck = new CardStack('leader-deck', 'Leader Deck')
    this.slayableMonsters = new CardPile(
      'slayable-monsters',
      'Slayable Monsters',
    )
    this.discardPile = new CardPile('discard-pile', 'Discard Pile')
    this.phase = GamePhase.Setup
    this.abilitiesUsedThisTurn = []
  }

  // ── Snapshot system ─────────────────────────────────────────

  saveSnapshot(): void {
    this.snapshotStack.push(this.clone())
  }

  clone(): GameState {
    const copy = new GameState(
      this.config,
      this.players.map((p) => p.clone()),
      this.parties.map((p) => p.clone()),
      this.cardRepo,
    )
    copy.mainDeck.setCards(this.mainDeck.getCards())
    copy.discardPile.setCards(this.discardPile.getAll())
    copy.slayableMonsters.setCards(this.slayableMonsters.getAll())
    copy.phase = this.phase
    copy.winnerId = this.winnerId

    return copy
  }

  restoreSnapshot(): void {
    const snapshot = this.snapshotStack.pop()
    if (!snapshot) return
    this.copyFrom(snapshot)
  }

  private copyFrom(gs: GameState): void {
    this.players = gs.players.map((p) => new Player(p.getData()))
    this.parties = gs.parties.map((p) => new Party(p.getData()))

    this.mainDeck.setCards([...gs.mainDeck.getCards()])
    this.discardPile.setCards([...gs.discardPile.getAll()])
    this.slayableMonsters.setCards([...gs.slayableMonsters.getAll()])
    this.phase = gs.phase
    this.winnerId = gs.winnerId
  }

  loadSnapshot(other: GameState): void {
    this.players = other.players.map((p) => new Player(p.getData()))
    this.parties = other.parties.map((p) => new Party(p.getData()))
    this.mainDeck.setCards(other.mainDeck.getCards())
    this.discardPile.setCards(other.discardPile.getAll())
    this.slayableMonsters.setCards(other.slayableMonsters.getAll())
    this.phase = other.phase
    this.winnerId = other.winnerId
  }

  clearSnapshot(): void {
    this.snapshotStack.pop()
  }

  hasSnapshot(): boolean {
    return this.snapshotStack.length > 0
  }

  // ── Getters ─────────────────────────────────────────────────

  getConfig(): GameConfig {
    return this.config
  }
  getPlayers(): Player[] {
    return this.players
  }
  getPlayer(id: string): Player | null {
    return this.players.find((p) => p.getId() === id) ?? null
  }
  getParties(): Party[] {
    return this.parties
  }
  getParty(playerId: string): Party | null {
    return this.parties.find((p) => p.getPlayerId() === playerId) ?? null
  }
  getMainDeck(): CardStack {
    return this.mainDeck
  }
  getMonsterDeck(): CardStack {
    return this.monsterDeck
  }
  getLeaderDeck(): CardStack {
    return this.leaderDeck
  }
  getSlayableMonsters(): CardPile {
    return this.slayableMonsters
  }
  getDiscardPile(): CardPile {
    return this.discardPile
  }
  getPhase(): GamePhase {
    return this.phase
  }
  getWinnerId(): string | undefined {
    return this.winnerId
  }
  getCardRepo(): ICardRepository {
    return this.cardRepo
  }
  getPlayerTurnId(): string | null {
    return this.playerTurn ?? null
  }
  getAbilitiesThisTurn() {
    return this.abilitiesUsedThisTurn
  }

  // ── Setters ─────────────────────────────────────────────────

  setPhase(phase: GamePhase): void {
    this.phase = phase
  }
  setWinner(playerId: string): void {
    this.winnerId = playerId
  }
}
