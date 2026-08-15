import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_FINAL_ROLL,
  CTX_LAST_DRAWN_CARD_ID,
  CTX_STOLEN_HERO_ID,
  chosenCards,
  chosenPlayers,
  finalRoll,
} from "./ability-context";

describe("AbilityContext", () => {
  it("should store sourceCardId and ownerId", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    expect(ctx.sourceCardId).toBe("card-1");
    expect(ctx.ownerId).toBe("player-1");
  });

  it("should set and get a value", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    ctx.set(CTX_LAST_DRAWN_CARD_ID, "card-42");
    expect(ctx.get<string>(CTX_LAST_DRAWN_CARD_ID)).toBe("card-42");
  });

  it("should return undefined for missing keys", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    expect(ctx.get(CTX_STOLEN_HERO_ID)).toBeUndefined();
  });

  it("should report has() correctly", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    expect(ctx.has(CTX_STOLEN_HERO_ID)).toBe(false);
    ctx.set(CTX_STOLEN_HERO_ID, ["card-7"]);
    expect(ctx.has(CTX_STOLEN_HERO_ID)).toBe(true);
  });

  it("should overwrite existing values", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    ctx.set(CTX_CHOSEN_PLAYER, ["player-2"]);
    ctx.set(CTX_CHOSEN_PLAYER, ["player-3"]);
    expect(ctx.get(CTX_CHOSEN_PLAYER)).toEqual(["player-3"]);
  });
});

// ---------------------------------------------------------------------------
// Typed readers — frame result slots always hold arrays, so single-pick call
// sites should not have to write [0] themselves.
// ---------------------------------------------------------------------------

describe("frame result readers", () => {
  it("chosenCards returns the picked cards", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    ctx.set(CTX_CHOSEN_CARD, ["hero-1", "hero-2"]);
    expect(chosenCards(ctx)).toEqual(["hero-1", "hero-2"]);
  });

  it("chosenCards returns an empty array when nothing was chosen", () => {
    expect(chosenCards(new AbilityContext("card-1", "player-1"))).toEqual([]);
  });

  it("chosenPlayers returns the picked players", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    ctx.set(CTX_CHOSEN_PLAYER, ["player-2"]);
    expect(chosenPlayers(ctx)).toEqual(["player-2"]);
  });

  // Scalar, unlike the choice slots — there is only ever one final roll.
  it("finalRoll reads the roll value directly", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    ctx.set(CTX_FINAL_ROLL, 12);
    expect(finalRoll(ctx)).toBe(12);
  });

  it("finalRoll is undefined when no roll resolved", () => {
    expect(finalRoll(new AbilityContext("card-1", "player-1"))).toBeUndefined();
  });
});
