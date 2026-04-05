import {
  ActionType,
  Audience,
  CardType,
  EffectDuration,
  GameEventType,
  HeroClass,
} from "shared";
import { DrawCardAction } from "./draw-card-action";
import { GameState } from "../game-state";
import { Player } from "../player";
import { Party } from "../party";
import { CardStack } from "../card-stack";

const makeGs = (deckCards: string[] = [], handCards: string[] = []) => {
  const deck = new CardStack("deck", "main");
  for (const c of deckCards) deck.addToBottom(c);
  const player = new Player({
    id: "p1",
    name: "Player 1",
    hand: handCards,
    partyId: "party-1",
    actionPointsPerTurn: 3,
  });
  const party = new Party({
    playerId: "p1",
    leaderId: "leader-1",
    heroIds: [],
    MonsterIds: [],
  });
  const gs = new GameState(deck);
  gs.registerPlayer(player);
  gs.registerParty(party);
  return { gs, player };
};

describe("DrawCardAction", () => {
  it("should have type DrawCard", () => {
    const action = new DrawCardAction("p1");
    expect(action.getType()).toBe(ActionType.DrawCard);
  });

  it("should have cost 1", () => {
    expect(new DrawCardAction("p1").getCost()).toBe(1);
  });

  it("should return the player id", () => {
    expect(new DrawCardAction("p1").getPlayerId()).toBe("p1");
  });

  describe("canExecute()", () => {
    it("should return false for unknown player", () => {
      const { gs } = makeGs(["card-1"]);
      expect(new DrawCardAction("unknown").canExecute(gs)).toBe(false);
    });

    it("should return false when deck is empty", () => {
      const { gs } = makeGs([]);
      expect(new DrawCardAction("p1").canExecute(gs)).toBe(false);
    });

    it("should return false when hand is full (10 cards)", () => {
      const hand = Array.from({ length: 10 }, (_, i) => `c${i}`);
      const { gs } = makeGs(["card-extra"], hand);
      expect(new DrawCardAction("p1").canExecute(gs)).toBe(false);
    });

    it("should return true when hand has space and deck has cards", () => {
      const { gs } = makeGs(["card-1"]);
      expect(new DrawCardAction("p1").canExecute(gs)).toBe(true);
    });
  });

  describe("execute()", () => {
    it("should add the drawn card to the player hand", () => {
      const { gs, player } = makeGs(["card-1"]);
      new DrawCardAction("p1").execute(gs);
      expect(player.getHand()).toContain("card-1");
    });

    it("should remove the card from the deck", () => {
      const { gs } = makeGs(["card-1"]);
      new DrawCardAction("p1").execute(gs);
      expect(gs.getMainDeck().getSize()).toBe(0);
    });

    it("should emit a CardDrawn event with PlayerOnly audience", () => {
      const { gs } = makeGs(["card-1"]);
      const events = new DrawCardAction("p1").execute(gs);
      expect(events).toHaveLength(1);
      expect(events[0].getType()).toBe(GameEventType.CardDrawn);
      expect(events[0].getAudience()).toBe(Audience.PlayerOnly);
      expect(events[0].getPlayerId()).toBe("p1");
      expect((events[0].getPayload() as any).cardId).toBe("card-1");
    });

    it("should return empty array when deck is empty", () => {
      const { gs } = makeGs([]);
      const events = new DrawCardAction("p1").execute(gs);
      expect(events).toHaveLength(0);
    });
  });
});
