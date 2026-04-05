import {
  ActionType,
  CardType,
  HeroClass,
  RollResult,
  GameEventType,
  Audience,
} from "./enums";
import { SkillData, CardBase } from "./types";

export interface ICard {
  getId(): string;
  getName(): string;
  getType(): CardType;
  getImage(): string;
  getDescription(): string;
}
export interface ICardRepository {
  getById(id: string): CardBase | null;
  getByType(type: CardType): CardBase[];
  getBySet(setName: string): CardBase[];
  getAll(): CardBase[];
  getAvailableClasses(): HeroClass[];
}

export interface ICardStack {
  getId(): string;
  getName(): string;
  draw(): string | null;
  addToTop(cardId: string): void;
  addToBottom(cardId: string): void;
  shuffle(): void;
  getSize(): number;
}

export interface ICardPile {
  getId(): string;
  getName(): string;
  pick(cardId?: string): string | null;
  add(cardId: string): void;
  getAll(): string[];
  getSize(): number;
}

export interface IGameEvent {
  getType(): GameEventType;
  getPlayerId(): string;
  getPayload(): unknown;
  getAudience(): Audience;
}

export interface IGameEventListener {
  onEvent(event: IGameEvent): void;
}

export interface IGameEventEmitter {
  emit(event: IGameEvent): void;
  addListener(listener: IGameEventListener): void;
  removeListener(listener: IGameEventListener): void;
}
