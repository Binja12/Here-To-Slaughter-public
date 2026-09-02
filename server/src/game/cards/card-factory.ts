import {
  CardBase,
  CardType,
  ChallengeCardData,
  HeroCardData,
  ICard,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  MonsterCardData,
  PartyLeaderData,
} from 'shared'
import { ChallengeCard } from './challenge-card'
import { HeroCard } from './hero-card'
import { ItemCard } from './item-card'
import { MagicCard } from './magic-card'
import { ModifierCard } from './modifier-card'
import { MonsterCard } from './monster-card'
import { PartyLeaderCard } from './party-leader-card'

// ---------------------------------------------------------------------------
// Card DATA -> card OBJECT. The one place that knows which class goes with
// which CardType.
//
// A card exists in three tables, all keyed by the same id: its DATA (printed
// text and numbers, in `shared`), its OBJECT (here, and registered on
// GameState), and its BEHAVIOUR (abilityRegistry, on the server). This is the
// first of those two meeting — the third is joined at runtime through
// `ctx.sourceCardId`, which is how one modifier declaration reads whichever
// copy's printed `values` it happens to be running for (§1).
//
// Nothing here consults the registry. A card with no ability is an ordinary
// card object; the processor simply finds no entry for it.
// ---------------------------------------------------------------------------

export function buildCard(data: CardBase): ICard {
  switch (data.type) {
    case CardType.Hero:
      return new HeroCard(data as HeroCardData)
    case CardType.Item:
      return new ItemCard(data as ItemCardData)
    case CardType.Magic:
      return new MagicCard(data as MagicCardData)
    case CardType.Modifier:
      return new ModifierCard(data as ModifierCardData)
    case CardType.Challenge:
      return new ChallengeCard(data as ChallengeCardData)
    case CardType.Monster:
      return new MonsterCard(data as MonsterCardData)
    case CardType.Leader:
      return new PartyLeaderCard(data as PartyLeaderData)
  }

  // Exhaustive: a new CardType without a branch is a compile error here rather
  // than a card that silently never reaches the table.
  const unhandled: never = data.type
  throw new Error(`buildCard: no card class for type ${String(unhandled)}`)
}
