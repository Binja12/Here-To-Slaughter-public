import { CardStack } from '../card-stack'
import { CardPile } from '../card-pile'
import { GamePhase, ReactionWindow, GameConfig } from 'shared'
import { Player } from '../player'
import { Party } from '../party'

export class GameState {
  private mainDeck: CardStack
  private monsterDeck: CardStack
  private leaderDeck: CardStack
  private slayableMonsters: CardPile
  private discardPile: CardPile
  private phase: GamePhase
  private reactionWindow?: ReactionWindow
  private winnerId?: string
  //TODO: private actionQueue: IAction[] = []
  //TODO: private currentTurn?: TurnData

  constructor(
    private config: GameConfig,
    private players: Player[],
    private parties: Party[],
  ) {
    // assigned inside using config
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

  // Getters
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
  getReactionWindow(): ReactionWindow | undefined {
    return this.reactionWindow
  }
  getWinnerId(): string | undefined {
    return this.winnerId
  }

  // Setters
  setPhase(phase: GamePhase): void {
    this.phase = phase
  }
  setWinner(playerId: string): void {
    this.winnerId = playerId
  }
  setReactionWindow(window: ReactionWindow): void {
    this.reactionWindow = window
  }
  clearReactionWindow(): void {
    this.reactionWindow = undefined
  }
}
