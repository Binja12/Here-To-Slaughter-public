import {
  AbilityContext,
  CTX_LAST_DRAWN_CARD_ID,
  CTX_STOLEN_FROM_PLAYER_ID,
  CTX_LAST_AFFECTED_CARD_ID,
  CTX_LAST_AFFECTED_PLAYER_ID,
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
    expect(ctx.get(CTX_STOLEN_FROM_PLAYER_ID)).toBeUndefined();
  });

  it("should report has() correctly", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    expect(ctx.has(CTX_LAST_AFFECTED_CARD_ID)).toBe(false);
    ctx.set(CTX_LAST_AFFECTED_CARD_ID, "card-7");
    expect(ctx.has(CTX_LAST_AFFECTED_CARD_ID)).toBe(true);
  });

  it("should overwrite existing values", () => {
    const ctx = new AbilityContext("card-1", "player-1");
    ctx.set(CTX_LAST_AFFECTED_PLAYER_ID, "player-2");
    ctx.set(CTX_LAST_AFFECTED_PLAYER_ID, "player-3");
    expect(ctx.get(CTX_LAST_AFFECTED_PLAYER_ID)).toBe("player-3");
  });
});
