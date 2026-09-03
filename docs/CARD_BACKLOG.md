# Card backlog — what the registry still lacks (2026-09-04)

68 of 136 printed cards have an entry in `server/src/game/repositories/
ability-repository/index.ts`; the deal is exactly that set (`dealable`).
This lists the other 68, split by whether the engine's CURRENT tasks,
effects and triggers already cover the wording.

The building blocks, all in `server/src/game/`:

- Tasks (`tasks/`): `ChoosePlayerTask({owner, hasHeroes})`,
  `ChooseCardTask({zone, owner, cardType, heroClass, unequipped}, requiresKey?)`
  (always writes `CTX_CHOSEN_CARD`), `DiscardTask` (owner's own hand, the
  chosen card), `DrawTask(n)` (writes `CTX_DRAWN_CARD_IDS`),
  `PullCardTask` (one random card from `CTX_CHOSEN_PLAYER`, writes
  `CTX_PULLED_CARD_IDS`), `CardTypeCondition(type, slot, label)` →
  `ConditionMet`, `ConfirmTask({confirms, subjectKey})` → `TaskConfirmed`,
  `PlayHeroTask(slot)`, `PlayItemTask(itemSlot, heroSlot)`,
  `PlayMagicTask(slot)`, `DestroyTask` (any party), `SacrificeTask` (own
  party), `StealFromPartyTask`, `GiveHeroTask`, `ApplyEffectTask({type,
  value, rollContext, cardTypes, expiry})`, `RollOnHeroTask`.
- Effects (`PassiveType`): RollBonus, ActionPointBonus,
  ModifierCounterBonus, CantBeStolen, CantBeChallenged, CantUseHeroEffect.
  Expiries: `untilEndOfTurn`, `untilOwnersNextTurn`,
  `untilSourceLeavesParty`, `untilUnequipped`.
- Triggers: `RollSuccess` / `RollFailed` (SelfCard = the hero's own roll),
  `FrameResolved` SelfCard (a magic card that survived its challenge),
  `CardDrawn`, `ModifierPlayed`, `ChallengePlayed`, `HeroDestroyed`,
  `HeroSacrificed`, `HeroStolen`, `MonsterSlain` SelfCard (a slain
  monster's passive), `MonsterFoughtBack` Attacker, `ConditionMet`,
  `TaskConfirmed`. Scopes: SelfCard, CarrierCard, OwnerEvent, OwnerTurn.

Reference declarations to copy from: `snowball-ability.ts` (draw → type
condition → confirm → play), `wiggles-ability.ts` (choose → steal →
confirm → roll), `forced-exchange-ability.ts` (choose player → choose
their hero → steal → give one back), `destructive-spell-ability.ts`
(discard → destroy), `malamammoth-ability.ts` (drawn item → confirm →
choose bare hero → equip), `warworn-owlbear-ability.ts` (slain monster
installs an effect), `divine-arrow-ability.ts` / `fist-of-reason-ability.ts`
(roll bonus scoped by RollContext), `enchanted-spell-ability.ts`.

Every entry needs its spec next to it (see any `*-ability.spec.ts`) and
its line in the registry map in `index.ts`.

## A. Existing mechanics only — 27 cards (for Codex)

Heroes (roll = `RollSuccess` SelfCard):

| Card | Steps |
|---|---|
| hero-001 Bad Axe | ChooseCard(Party, All) → Destroy |
| hero-009 Serious Grey | ChooseCard(Party, All) → Destroy → Draw(1) |
| hero-012 Wildshot | Draw(3) → ChooseCard(Hand, Self) → Discard |
| hero-017 Kit Napper | ChooseCard(Party, Others) → StealFromParty |
| hero-018 Sly Pickings | ChoosePlayer(Others) → Pull → CardTypeCondition(Item, PULLED) → Confirm → ChooseCard(Party, Self, unequipped) → PlayItem(PULLED) |
| hero-019 Meowzio | ChoosePlayer(Others, hasHeroes) → ChooseCard(Party, Chosen) → StealFromParty → Pull (from `CTX_CHOSEN_PLAYER`) |
| hero-021 Silent Shadow | ChoosePlayer(Others) → ChooseCard(Hand, Chosen) → a small "take chosen card to hand" step — see B if that step does not exist; the choice itself is supported (the options reveal the hand, which IS the card) |
| hero-029 Vibrant Glow | ApplyEffect(RollBonus 5, untilEndOfTurn) — Enchanted Spell with 5 |
| hero-030 Iron Resolve | ApplyEffect(CantBeChallenged, untilEndOfTurn) — Owlbear's effect, no cardTypes |
| hero-032 Calming Voice | ApplyEffect(CantBeStolen, untilOwnersNextTurn) |
| hero-034 Buttons | ChoosePlayer(Others) → Pull → CardTypeCondition(Magic, PULLED) → Confirm → PlayMagic(PULLED) — Snowball's shape over the pulled slot |
| hero-037 Whiskers | ChooseCard(Party, Others) → StealFromParty → ChooseCard(Party, All) → Destroy |
| hero-038 Fluffy | ChooseCard(Party, All) → Destroy, twice |
| hero-041 Mellow Dee | Draw(1) → CardTypeCondition(Hero, DRAWN) → Confirm → PlayHero(DRAWN) |
| hero-042 Lucky Bucky | ChoosePlayer(Others) → Pull → CardTypeCondition(Hero, PULLED) → Confirm → PlayHero(PULLED) |
| hero-043 Fuzzy Cheeks | Draw(1) → ChooseCard(Hand, Self, cardType Hero) → PlayHero |
| hero-044 Napping Nibbles | one entry with no steps ("Do nothing") |
| hero-048 Peanut | Draw(2) |

Monsters (passive installs on `MonsterSlain` SelfCard; fight-backs are data):

| Card | Steps |
|---|---|
| monster-124 Anuran Cauldron | ApplyEffect(RollBonus 1) — Divine Arrow with RollContext.Any |
| monster-126 Dracos | trigger `HeroDestroyed` OwnerEvent → Confirm → Draw(1) |
| monster-128 Arctic Aries | trigger `RollSuccess` OwnerEvent → Confirm → Draw(1). Caveat: a leader activation also announces RollSuccess, so it would draw on the Shadow Claw too — acceptable for now, note it in the spec |
| monster-133 Dark Dragon King | ApplyEffect(RollBonus 1, RollContext.HeroEffect) — Charismatic Song's effect, Owlbear's trigger |
| monster-136 Titan Wyvern | ApplyEffect(RollBonus 1, RollContext.Challenge) — Fist of Reason's effect, Owlbear's trigger |

Magic (`FrameResolved` SelfCard):

| Card | Steps |
|---|---|
| magic-051 Entangling Trap | ChooseCard(Hand, Self) → Discard, twice → ChooseCard(Party, Others) → StealFromParty |

## B. Needs a mechanic the engine does not have — 41 cards (the owner + Claude)

Grouped by the missing piece; one piece usually unlocks several cards.

1. **A choice posed to ANOTHER player** (the victim picks, from their own
   hand or party; today every choice window's respondent is the ability
   owner, and `DiscardTask` / `SacrificeTask` act on the owner only):
   hero-003 Beary Wise, hero-004 Heavy Bear, hero-006 Tough Teddy,
   hero-033 Hopper, hero-035 Spooky, hero-047 Greedy Cheeks,
   monster-127 Bloodwing.
2. **A loop over "each other player"** (one step per seat, possibly with a
   party filter): hero-003 Beary Wise, hero-006 Tough Teddy, hero-024
   Smooth Mimimeow, hero-035 Spooky, hero-047 Greedy Cheeks.
3. **Take a card from the discard pile to hand** (`ChooseCardTask` over
   `Zone.Discard` exists; the move task does not): hero-011 Lookie Rookie,
   hero-025 Guiding Light, hero-027 Radiant Horn, hero-039 Bun Bun,
   magic-061 Call to the Fallen. Same task, from a hand slot, finishes
   hero-021 Silent Shadow.
4. **Return an equipped item to a hand** (unequip without discarding):
   hero-026 Holy Curselifter, magic-058 Winds of Change, magic-060
   Forceful Winds; and the "item to your hand instead of the pile" half of
   hero-023 Shurikitty.
5. **CantBeDestroyed effect + DestroyTask honouring it**: hero-031 Mighty
   Blade, monster-130 Terratuga; the replacement version ("discard the doll
   instead") is item-066 Decoy Doll.
6. **A class override effect read by party-class checks**: item-067 … 072,
   the six masks.
7. **A replacement effect on destroy** ("you may STEAL instead"):
   monster-122 Corrupted Sabretooth.
8. **Reveal / peek** (show hidden cards without moving them — to one player
   for a peek, to the table for "you may reveal it"): hero-016 Sharp Fox (a
   hand), hero-014 Bullseye (top 3 of the deck, then reorder), hero-008 Pan
   Chucks and monster-132 Rex Major (reveal a drawn card to unlock the rest;
   the rest is Snowball's shape once a reveal step exists).
9. **Small task gaps**, each a few lines: draw for ANOTHER player (hero-020
   Plundering Puma); draw until a hand size (hero-015 Wily Red); trade
   hands (hero-046 Dodgy Dealer); a `ChooseCardTask` output slot so two
   picks can coexist (hero-013 Hook: item from hand + hero to wear it);
   a card filter "only cards in slot X" (hero-022 Slippery Paws: discard
   one of the two pulled; hero-010 Quick Draw: play the drawn card that IS
   the item — `PlayItemTask(DRAWN)` takes the first drawn card, so a draw
   of two can pick the wrong one, as Codex's note says); carry `CTX_CHOSEN_PLAYER` across `ConditionMet`
   so a second pull hits the same player (hero-002 Fury Knuckle, hero-005
   Bear Claw); a "count what the previous step did" loop (hero-007 Qi Bear:
   one destroy per card actually discarded); a slot holding the source
   card itself for `GiveHeroTask` (hero-045 Tipsy Tootie); an "any player"
   trigger scope (monster-125 Crowned Serpent: any seat plays a modifier).

Once 1–4 and the first five of 9 exist, everything in B except the masks,
Decoy Doll, Sabretooth and the two peeks is declaration work again.
