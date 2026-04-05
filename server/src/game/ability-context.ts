export const CTX_LAST_DRAWN_CARD_ID = "lastDrawnCardId";
export const CTX_STOLEN_FROM_PLAYER_ID = "stolenFromPlayerId";
export const CTX_LAST_AFFECTED_CARD_ID = "lastAffectedCardId";
export const CTX_LAST_AFFECTED_PLAYER_ID = "lastAffectedPlayerId";

export class AbilityContext {
  private data: Map<string, unknown> = new Map();

  constructor(
    public readonly sourceCardId: string,
    public readonly ownerId: string,
  ) {}

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.data.has(key);
  }
}
