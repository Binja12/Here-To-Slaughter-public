import { CardType } from "./enums";
import { SkillData } from "./types";

export interface ICard {
  getId(): string;
  getName(): string;
  getType(): CardType;
  getImage(): string;
  getDescription(): string;
}

export interface IBoardCard extends ICard {
  getSkill(): SkillData;
  getReward(): SkillData;
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
