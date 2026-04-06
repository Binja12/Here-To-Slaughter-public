import { IGameEvent, IGameEventEmitter, IGameEventListener } from "shared";

export class GameEventEmitter implements IGameEventEmitter {
  private listeners: IGameEventListener[] = [];

  emit(event: IGameEvent): void {
    for (const listener of this.listeners) {
      listener.onEvent(event);
    }
  }

  addListener(listener: IGameEventListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: IGameEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
}
