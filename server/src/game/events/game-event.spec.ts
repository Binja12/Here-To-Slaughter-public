import { Audience, GameEventType } from "shared";
import { GameEvent } from "./game-event";

describe("GameEvent", () => {
  it("should return the event type", () => {
    const event = new GameEvent(GameEventType.CardDrawn, "player-1", {});
    expect(event.getType()).toBe(GameEventType.CardDrawn);
  });

  it("should return the player id", () => {
    const event = new GameEvent(GameEventType.TurnEnded, "player-2", {});
    expect(event.getPlayerId()).toBe("player-2");
  });

  it("should return the payload", () => {
    const payload = { cardId: "card-5" };
    const event = new GameEvent(GameEventType.CardDrawn, "player-1", payload);
    expect(event.getPayload()).toBe(payload);
  });

  it("should default audience to All", () => {
    const event = new GameEvent(GameEventType.DiceRolled, "player-1", {});
    expect(event.getAudience()).toBe(Audience.All);
  });

  it("should accept explicit audience", () => {
    const event = new GameEvent(
      GameEventType.CardDrawn,
      "player-1",
      {},
      Audience.PlayerOnly,
    );
    expect(event.getAudience()).toBe(Audience.PlayerOnly);
  });
});
