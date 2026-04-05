import {
  IGameEvent,
  IGameEventListener,
  GameEventType,
  Audience,
} from "shared";
import { GameEventEmitter } from "./game-event-emitter";
import { GameEvent } from "./game-event";

class StubListener implements IGameEventListener {
  received: IGameEvent[] = [];
  onEvent(event: IGameEvent): void {
    this.received.push(event);
  }
}

describe("GameEventEmitter", () => {
  it("should deliver events to all registered listeners", () => {
    const emitter = new GameEventEmitter();
    const listenerA = new StubListener();
    const listenerB = new StubListener();
    emitter.addListener(listenerA);
    emitter.addListener(listenerB);

    const event = new GameEvent(GameEventType.TurnStarted, "player-1", {});
    emitter.emit(event);

    expect(listenerA.received).toHaveLength(1);
    expect(listenerB.received).toHaveLength(1);
    expect(listenerA.received[0]).toBe(event);
  });

  it("should not deliver to removed listener", () => {
    const emitter = new GameEventEmitter();
    const listener = new StubListener();
    emitter.addListener(listener);
    emitter.removeListener(listener);

    emitter.emit(new GameEvent(GameEventType.TurnEnded, "player-1", {}));

    expect(listener.received).toHaveLength(0);
  });

  it("should deliver multiple events in order", () => {
    const emitter = new GameEventEmitter();
    const listener = new StubListener();
    emitter.addListener(listener);

    const e1 = new GameEvent(GameEventType.TurnStarted, "player-1", {});
    const e2 = new GameEvent(
      GameEventType.CardDrawn,
      "player-1",
      {},
      Audience.PlayerOnly,
    );
    emitter.emit(e1);
    emitter.emit(e2);

    expect(listener.received[0]).toBe(e1);
    expect(listener.received[1]).toBe(e2);
  });

  it("should deliver nothing when no listeners registered", () => {
    const emitter = new GameEventEmitter();
    expect(() =>
      emitter.emit(new GameEvent(GameEventType.TurnStarted, "player-1", {})),
    ).not.toThrow();
  });
});
