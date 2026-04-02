import { GamePhase } from 'shared'
import { GameConfig } from './game-config'
import { Player } from '../player'
import { Party } from '../party'
import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { ICardRepository } from 'shared'
import { PlayerData, PartyData } from 'shared'

type GameStateSnapshot = {
  players: PlayerData[]
  parties: PartyData[]
  phase: GamePhase
  winnerId?: string
}

export class GameState {
  private mainDeck: CardStack
  private monsterDeck: CardStack
  private leaderDeck: CardStack
  private slayableMonsters: CardPile
  private discardPile: CardPile
  private phase: GamePhase
  private winnerId?: string
  private snapshotStack: GameStateSnapshot[] = []

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
  }

  // ── Snapshot system ─────────────────────────────────────────

  saveSnapshot(): void {
    this.snapshotStack.push({
      players: this.players.map((p) => p.getData()),
      parties: this.parties.map((p) => p.getData()),
      phase: this.phase,
      winnerId: this.winnerId,
    })
  }

  restoreSnapshot(): void {
    const snapshot = this.snapshotStack.pop()
    if (!snapshot) return
    this.players = snapshot.players.map((d) => new Player(d))
    this.parties = snapshot.parties.map((d) => new Party(d))
    this.phase = snapshot.phase
    this.winnerId = snapshot.winnerId
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

  // ── Setters ─────────────────────────────────────────────────

  setPhase(phase: GamePhase): void {
    this.phase = phase
  }
  setWinner(playerId: string): void {
    this.winnerId = playerId
  }
}
