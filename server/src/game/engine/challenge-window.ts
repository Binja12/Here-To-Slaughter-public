// challenge-window.ts
export class ChallengeWindow implements IChallengeWindow {
  private usedCardIds: string[] = []
  private challengerWindow?: ModifierWindow
  private challengedWindow?: ModifierWindow
  private resolved: boolean = false
  private challengerWon: boolean = false
  private lastActivityAt: number
  private challengerId?: string

  constructor(
    private challengedId: string, // active player
    private challengedCardId: string, // card being challenged
    private timeoutMs: number,
  ) {
    this.lastActivityAt = Date.now()
  }

  handleReaction(playerId: string, cardId: string, gs: GameState): void {
    const card = gs.getCardRepo().getById(cardId)
    if (!card) return

    // discard immediately in real time
    gs.getDiscardPile().add(cardId)
    gs.getPlayer(playerId)!.removeFromHand(cardId)
    this.usedCardIds.push(cardId)

    this.addResponse(playerId, cardId)

    if (card.type === CardType.Challenge) {
      this.challengerId = playerId
      this.startResolution(gs)
    }
  }

  startResolution(gs: GameState): void {
    this.challengerWindow = new ModifierWindow(
      this.challengerId!,
      this.timeoutMs,
    )
    this.challengedWindow = new ModifierWindow(
      this.challengedId,
      this.timeoutMs,
    )
  }

  handleModifier(
    playerId: string,
    cardId: string,
    targetPlayerId: string,
    valueIndex: number,
    gs: GameState,
  ): void {
    const card = gs.getCardRepo().getById(cardId) as ModifierCardData
    if (!card) return

    // discard immediately
    gs.getDiscardPile().add(cardId)
    gs.getPlayer(playerId)!.removeFromHand(cardId)

    // apply to correct modifier window
    const value = card.values[valueIndex]
    if (targetPlayerId === this.challengerId) {
      this.challengerWindow?.applyModifier(value)
      this.challengerWindow?.addResponse(playerId, cardId)
    } else {
      this.challengedWindow?.applyModifier(value)
      this.challengedWindow?.addResponse(playerId, cardId)
    }
  }

  resolve(gs: GameState): void {
    if (this.challengerWindow && this.challengedWindow) {
      // collect all used cards from modifier windows
      const allUsedCards = [
        ...this.usedCardIds,
        ...this.challengerWindow.getUsedCardIds(),
        ...this.challengedWindow.getUsedCardIds(),
      ]

      // re-discard all used cards (in case snapshot reverted them)
      allUsedCards.forEach((id) => {
        if (!gs.getDiscardPile().getAll().includes(id)) {
          gs.getDiscardPile().add(id)
        }
      })

      // resolve winner
      const resolver = new ChallengeRollResolver(
        this.challengerWindow.getFinalRoll(),
      )
      const result = resolver.resolve(this.challengedWindow.getFinalRoll())
      this.challengerWon = result === RollResult.ChallengerWins
    }

    // challenger won → discard the challenged card
    if (this.challengerWon) {
      gs.getDiscardPile().add(this.challengedCardId)
      gs.getPlayer(this.challengedId)!.removeFromHand(this.challengedCardId)
    }

    this.resolved = true
  }

  // ── IReactionWindow ─────────────────────────────────────────
  getType(): ReactionWindowType {
    return ReactionWindowType.Challenge
  }
  isResolved(): boolean {
    return this.resolved
  }
  getTimeoutMs(): number {
    return this.timeoutMs
  }
  getLastActivityAt(): number {
    return this.lastActivityAt
  }
  getChallengerId(): string {
    return this.challengerId ?? ''
  }
  getChallengedId(): string {
    return this.challengedId
  }
  getChallengerWindow(): IModifierWindow {
    return this.challengerWindow!
  }
  getChallengedWindow(): IModifierWindow {
    return this.challengedWindow!
  }
  didChallengerWin(): boolean {
    return this.challengerWon
  }

  addResponse(playerId: string, cardId: string): void {
    this.lastActivityAt = Date.now()
  }
}
