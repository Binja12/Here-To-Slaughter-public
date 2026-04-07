import { ICard } from 'shared'
import { IAbility, IPassive, IReactionWindow } from './interfaces'
import { Player } from './player'
import { Party } from './party'
import { CardStack } from './card-stack'
import { HeroCard } from './cards/hero-card'
import { CardPile } from './card-pile'

export class GameState {
  private players: Map<string, Player> = new Map()
  private parties: Map<string, Party> = new Map()
  private cards: Map<string, ICard> = new Map()
  private currentPlayerId?: string
  private abilitiesUsedThisTurn: string[] = []
  private reactionWindows: IReactionWindow[] = []
  private pendingInstaPlay?: {
    playerId: string
    cardId: string
    optional: boolean
  }

  constructor(
    private mainDeck: CardStack,
    private discrdPile: CardPile,
  ) {}

  // --- Registration ---

  registerPlayer(player: Player): void {
    this.players.set(player.getId(), player)
  }

  registerParty(party: Party): void {
    this.parties.set(party.getPlayerId(), party)
  }

  registerCard(card: ICard): void {
    this.cards.set(card.getId(), card)
  }

  // --- Players ---

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId)
  }

  getPlayers(): Player[] {
    return Array.from(this.players.values())
  }

  // --- Parties ---

  getParty(playerId: string): Party {
    const party = this.parties.get(playerId)
    if (!party) throw new Error(`Party not found for player ${playerId}`)
    return party
  }

  // --- Cards ---

  getCard(cardId: string): ICard | undefined {
    return this.cards.get(cardId)
  }

  getHeroAbility(heroId: string): IAbility | undefined {
    const card = this.cards.get(heroId)
    if (card instanceof HeroCard) return card.getAbility()
    return undefined
  }

  // getCardPassives(cardId: string): IPassive[] {
  //   const card = this.cards.get(cardId)
  //   if (card instanceof HeroCard) return card.getPassives()
  //   return []
  // }

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

  // --- Deck ---

  getMainDeck(): CardStack {
    return this.mainDeck
  }

  getDiscardPile() {
    return this.discrdPile
  }

  // --- Turn state ---

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

  // --- Reaction windows ---

  addReactionWindow(window: IReactionWindow): void {
    this.reactionWindows.push(window)
  }

  removeReactionWindow(window: IReactionWindow): void {
    this.reactionWindows = this.reactionWindows.filter((w) => w !== window)
  }

  getReactionWindows(): IReactionWindow[] {
    return [...this.reactionWindows]
  }

  hasOpenReactionWindow(): boolean {
    return this.reactionWindows.some((w) => w.isOpen())
  }

  // --- Pending actions ---

  setPendingInstaPlay(data: {
    playerId: string
    cardId: string
    optional: boolean
  }): void {
    this.pendingInstaPlay = data
  }
}
