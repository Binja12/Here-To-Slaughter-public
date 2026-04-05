import { CardType, HeroClass, EffectDuration } from "shared";
import { GameState } from "./game-state";
import { Player } from "./player";
import { Party } from "./party";
import { CardStack } from "./card-stack";
import { HeroCard } from "./cards/hero-card";
import { IAbility, IPassive } from "./interfaces";
import { GameEventType } from "shared";

const makePlayer = (id: string) =>
  new Player({
    id,
    name: `Player ${id}`,
    hand: [],
    partyId: `party-${id}`,
    actionPointsPerTurn: 3,
  });

const makeParty = (
  playerId: string,
  leaderId: string,
  heroIds: string[] = [],
) => new Party({ playerId, leaderId, heroIds, MonsterIds: [] });

const makeHeroCard = (id: string, ability?: IAbility, passives?: IPassive[]) =>
  new HeroCard(
    {
      id,
      name: `Hero ${id}`,
      type: CardType.Hero,
      image: "",
      description: "",
      heroClass: HeroClass.Wizard,
      rollReq: 4,
      effect: { duration: EffectDuration.TurnEnd },
    },
    ability,
    passives,
  );

describe("GameState", () => {
  let deck: CardStack;
  let gs: GameState;

  beforeEach(() => {
    deck = new CardStack("deck-1", "main-deck");
    gs = new GameState(deck);
  });

  // --- Registration & retrieval ---

  it("should register and retrieve a player", () => {
    const player = makePlayer("p1");
    gs.registerPlayer(player);
    expect(gs.getPlayer("p1")).toBe(player);
  });

  it("should return undefined for unknown player", () => {
    expect(gs.getPlayer("unknown")).toBeUndefined();
  });

  it("should return all registered players", () => {
    gs.registerPlayer(makePlayer("p1"));
    gs.registerPlayer(makePlayer("p2"));
    expect(gs.getPlayers()).toHaveLength(2);
  });

  it("should register and retrieve a party", () => {
    const party = makeParty("p1", "leader-1");
    gs.registerParty(party);
    expect(gs.getParty("p1")).toBe(party);
  });

  it("should throw when party not found", () => {
    expect(() => gs.getParty("unknown")).toThrow();
  });

  it("should register and retrieve a card", () => {
    const card = makeHeroCard("hero-1");
    gs.registerCard(card);
    expect(gs.getCard("hero-1")).toBe(card);
  });

  it("should return undefined for unknown card", () => {
    expect(gs.getCard("ghost")).toBeUndefined();
  });

  // --- Deck ---

  it("should return the main deck", () => {
    expect(gs.getMainDeck()).toBe(deck);
  });

  // --- Turn state ---

  it("should start with no current player", () => {
    expect(gs.getCurrentPlayerId()).toBeUndefined();
  });

  it("should set and get current player", () => {
    gs.setCurrentPlayerId("p1");
    expect(gs.getCurrentPlayerId()).toBe("p1");
  });

  it("should mark and retrieve abilities used this turn", () => {
    gs.markAbilityUsed("hero-1");
    gs.markAbilityUsed("hero-2");
    expect(gs.getAbilitiesUsedThisTurn()).toEqual(["hero-1", "hero-2"]);
  });

  it("should clear abilities used this turn", () => {
    gs.markAbilityUsed("hero-1");
    gs.clearUsedAbilities();
    expect(gs.getAbilitiesUsedThisTurn()).toHaveLength(0);
  });

  // --- Hero ability / passives ---

  it("should return hero ability from registered HeroCard", () => {
    const ability: IAbility = { steps: [] };
    const card = makeHeroCard("hero-1", ability);
    gs.registerCard(card);
    expect(gs.getHeroAbility("hero-1")).toBe(ability);
  });

  it("should return undefined ability when HeroCard has none", () => {
    const card = makeHeroCard("hero-1");
    gs.registerCard(card);
    expect(gs.getHeroAbility("hero-1")).toBeUndefined();
  });

  it("should return undefined ability for unknown card", () => {
    expect(gs.getHeroAbility("ghost")).toBeUndefined();
  });

  it("should return card passives from registered HeroCard", () => {
    const passive: IPassive = { trigger: GameEventType.CardDrawn, steps: [] };
    const card = makeHeroCard("hero-1", undefined, [passive]);
    gs.registerCard(card);
    expect(gs.getCardPassives("hero-1")).toEqual([passive]);
  });

  it("should return empty passives for unknown card", () => {
    expect(gs.getCardPassives("ghost")).toEqual([]);
  });

  // --- Card ownership ---

  it("should find owner of a card in hand", () => {
    const player = makePlayer("p1");
    player.addToHand("card-5");
    gs.registerPlayer(player);
    gs.registerParty(makeParty("p1", "leader-1"));
    expect(gs.getCardOwner("card-5")).toBe("p1");
  });

  it("should find owner of a hero in party", () => {
    gs.registerPlayer(makePlayer("p1"));
    gs.registerParty(makeParty("p1", "leader-1", ["hero-7"]));
    expect(gs.getCardOwner("hero-7")).toBe("p1");
  });

  it("should return undefined for unowned card", () => {
    gs.registerPlayer(makePlayer("p1"));
    gs.registerParty(makeParty("p1", "leader-1"));
    expect(gs.getCardOwner("ghost")).toBeUndefined();
  });

  // --- getAllActiveCards ---

  it("should return all party leaders and heroes", () => {
    gs.registerParty(makeParty("p1", "leader-1", ["hero-1", "hero-2"]));
    gs.registerParty(makeParty("p2", "leader-2", ["hero-3"]));
    const active = gs.getAllActiveCards();
    expect(active).toContain("leader-1");
    expect(active).toContain("hero-1");
    expect(active).toContain("hero-2");
    expect(active).toContain("leader-2");
    expect(active).toContain("hero-3");
  });
});
