/** string[] — written by DrawTask: every card that draw produced, in order. */
export const CTX_DRAWN_CARD_IDS = "drawnCardIds";

/**
 * string[] — the hero StealFromPartyTask moved, kept so a later step can still
 * reach it after another card choice has overwritten CTX_CHOSEN_CARD.
 *
 * The player it was taken FROM is deliberately not stored: nothing reads it,
 * and the HeroStolen event already carries it for the log.
 */
export const CTX_STOLEN_HERO_ID = "stolenHeroId";

// ---------------------------------------------------------------------------
// Frame result keys
//
// Each reaction window declares which of these its outcome belongs to (see
// IReactionWindow.resultKey), and AbilityProcessor writes the resolved value
// there when it resumes the pipeline. Because the window type decides the key,
// a modifier window can never land in a card slot and a confirm prompt can
// never be mistaken for a chosen card.
//
// Every one of these holds an ARRAY — length 1 for single picks — so multi-
// select choices need no migration later.
// ---------------------------------------------------------------------------

/** string[] — written by CardChoiceWindow. */
export const CTX_CHOSEN_CARD = "chosenCard";

/** string[] — written by PlayerChoiceWindow. */
export const CTX_CHOSEN_PLAYER = "chosenPlayer";

/**
 * number — written by ModifierWindow. Scalar, not an array: a roll resolves to
 * exactly one value, so there is no multi-select case to leave room for.
 *
 * Only ever present on the success path: a roll under its requirement restores
 * the frame, which discards the pipeline along with it, so nothing downstream
 * ever runs to read a failed roll.
 */
export const CTX_FINAL_ROLL = "finalRoll";

/**
 * Returned by a window whose outcome is deliberately NOT an ability input —
 * a confirm prompt or a challenge, where release-vs-restore already carries
 * the whole meaning and a key would only ever hold a constant.
 *
 * A sentinel rather than `undefined` so "decided there is none" is a value a
 * test can assert on, and cannot be confused with an author forgetting to
 * declare one. A symbol, so it can never collide with a real key.
 */
export const NO_CONTEXT_RESULT = Symbol("noContextResult");


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

// ---------------------------------------------------------------------------
// Typed readers — keep the [0] out of call sites for the single-pick case.
// ---------------------------------------------------------------------------

export function chosenCards(ctx: AbilityContext): string[] {
  return ctx.get<string[]>(CTX_CHOSEN_CARD) ?? [];
}

export function chosenPlayers(ctx: AbilityContext): string[] {
  return ctx.get<string[]>(CTX_CHOSEN_PLAYER) ?? [];
}

/** Already scalar on the context — no unwrapping needed. */
export function finalRoll(ctx: AbilityContext): number | undefined {
  return ctx.get<number>(CTX_FINAL_ROLL);
}
