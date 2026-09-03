/** string[] — written by DrawTask: every card that draw produced, in order. */
export const CTX_DRAWN_CARD_IDS = "drawnCardIds";

/** string[] — written by StealFromPartyTask. */
export const CTX_STOLEN_HERO_ID = "stolenHeroId";

/**
 * string[] — the player StealFromPartyTask actually took FROM, written on the
 * same paths as CTX_STOLEN_HERO_ID and empty whenever the steal produced
 * nothing. That is what lets a later step be conditional on the steal without
 * asking about it: an empty slot is "ran and produced nothing", and the step
 * reading it skips itself (§2).
 */
export const CTX_STOLEN_FROM_PLAYER = "stolenFromPlayer";

/** string[] — written by PullCardTask: what came out of the other hand. */
export const CTX_PULLED_CARD_IDS = "pulledCardIds";

// ---------------------------------------------------------------------------
// Frame result keys. A window names one via IReactionWindow.resultKey, and
// TaskManager writes the value there on resume.
// ---------------------------------------------------------------------------

/** string[] — written by CardChoiceWindow. */
export const CTX_CHOSEN_CARD = "chosenCard";

/** string[] — written by PlayerChoiceWindow. */
export const CTX_CHOSEN_PLAYER = "chosenPlayer";

/**
 * The ability's own card, as a slot — set by the constructor, so a step that
 * reads "the hero to move" from a slot can be pointed at the card itself:
 * Tipsy Tootie moves ITSELF into the party it stole from.
 */
export const CTX_SOURCE_CARD = "sourceCard";

/** number — written by ModifierWindow. Scalar; only set on a successful roll. */
export const CTX_FINAL_ROLL = "finalRoll";

/** number[] — written by ValueChoiceWindow. */
export const CTX_CHOSEN_VALUE = "chosenValue";

/**
 * string[] — whose roll a modifier is aimed at. Seeded from ModifierPlayed,
 * because the reaction knew the target and the entry that lands the bonus runs
 * with a fresh context.
 */
export const CTX_MODIFIER_TARGET = "modifierTarget";

/** Returned by resultKey() when a window's outcome is not an ability input. */
export const NO_CONTEXT_RESULT = Symbol("noContextResult");


export class AbilityContext {
  private data: Map<string, unknown> = new Map();

  constructor(
    public readonly sourceCardId: string,
    public readonly ownerId: string,
  ) {
    this.data.set(CTX_SOURCE_CARD, [sourceCardId]);
  }

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

export function chosenValues(ctx: AbilityContext): number[] {
  return ctx.get<number[]>(CTX_CHOSEN_VALUE) ?? [];
}
