import { CardView } from '../contract';

// Every card on the table is drawn from its BOARD scan under client/public/
// board/. There is no template art any more (the owner, 2026-09-04: the old
// /cards folder is gone); a card without a scan shows a broken image, which
// is the reminder to add one.

/* ------------------------------------------------------------------ */
/* BOARD design (client/public/board/): premium scans, frame baked in  */
/* ------------------------------------------------------------------ */

export const SMALL_BACK = '/board/Small Card Back.png'; // any regular pile
export const BIG_BACK = '/board/Big Card Back.png'; // monster deck only
export const BOARD_CARD_ASPECT = 1060 / 1484; // board heroes + small back
export const MONSTER_CARD_ASPECT = 956 / 1645; // board monsters + big back

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** filename quirks in /board/heroes */
const BOARD_HERO_OVERRIDES: Record<string, string> = {
  'beary-wise': 'Breay Wise', // typo on disk
};
/** Board-design hero scan for the slug of a printed `image` field. */
export const boardHeroCardUrl = (slug: string): string =>
  slug === 'guiding-light'
    ? '/board/heroes/Hero Guardian Light.png' // typo on disk
    : `/board/heroes/Hero ${BOARD_HERO_OVERRIDES[slug] ?? titleCase(slug)}.png`;

/** name like "Mega Slime" → /board/Monsters/Monster Mega Slime.png */
export const boardMonsterUrl = (name: string) =>
  name === 'Warworn Owlbear' // file lacks the "Monster " prefix
    ? '/board/Monsters/Warworn Owlbear.png'
    : `/board/Monsters/Monster ${name}.png`;

/* ------------------------------------------------------------------ */
/* Non-hero board cards: items, magics, modifiers, challenge. These have  */
/* only a BOARD-design scan (no separate hand scan), all 1086×1448 (0.75  */
/* aspect, same as the board heroes). Each folder's files are exactly     */
/* "<Kind> <Display Name>.png", so we build the url straight from a        */
/* display name. The arrays double as demo decks / draw pools.             */
/* ------------------------------------------------------------------ */

export const NONHERO_CARD_ASPECT = 1086 / 1448; // 0.75

export const ITEMS = [
  'Bad Mask',
  "Curse Of The Snake's Eyes",
  'Decoy Doll',
  'Fighter Mask',
  'Guardian Mask',
  'Particularly Rusty Coin',
  'Ranger Mask',
  'Really Big Ring',
  'Sealing Key',
  'Suspiciously Shiny Coin',
  'Thief Mask',
  'Wizard Mask',
] as const;
export type ItemName = (typeof ITEMS)[number];
export const boardItemUrl = (name: string) => `/board/Items/Item ${name}.png`;

export const MAGICS = [
  'Critical Boost',
  'Destructive Spell',
  'Enchanted Spell',
  'Entangling Trap',
  'Forced Exchange',
  'Forceful Winds',
  'Winds Of Change',
] as const;
export const boardMagicUrl = (name: string) => `/board/Magics/Magic ${name}.png`;

export const MODIFIERS = ['+1-3', '+2-2', '+3-1', '+4', '-4'] as const;
export const boardModifierUrl = (name: string) =>
  `/board/Modifiers/Modifier ${name}.png`;

export const boardChallengeUrl = (name = 'Basic') =>
  `/board/challenge/Challenge ${name}.png`;

export const LEADER_CARD_ASPECT = 1024 / 1536;

/** name like "The Divine Arrow" → /board/Leaders/Leader The Divine Arrow.png */
export const boardLeaderUrl = (name: string) =>
  `/board/Leaders/Leader ${name}.png`;

/** the six board leaders (one per class), for demo/seat assignment */
export const LEADERS = {
  Bard: 'The Charismatic Song',
  Wizard: 'The Cloacked Sage',
  Ranger: 'The Divine Arrow',
  Fighter: 'The Fist Of Reason',
  Guardian: 'The Protecting Horn',
  Thief: 'The Shadow Claw',
} as const;

const ART_NAME_OVERRIDES: Record<string, string> = {
  'The Cloaked Sage': 'The Cloacked Sage',
  'The Fist of Reason': 'The Fist Of Reason',
  'Corrupted Sabretooth': 'Corrupted Sabertooth',
  'Bard Mask': 'Bad Mask',
  "Curse of the Snake's Eyes": "Curse Of The Snake's Eyes",
  'Winds of Change': 'Winds Of Change',
};

const heroSlugFromImage = (image: string) =>
  image.split('/').pop()?.replace(/\.png$/i, '') ?? '';

/** Resolve a server-shaped card to the scanned art already on disk. */
export function artFor(card: CardView): { url: string; aspect: number } {
  const name = ART_NAME_OVERRIDES[card.name] ?? card.name;
  switch (card.type) {
    case 'Hero': {
      const slug = heroSlugFromImage(card.image);
      return { url: boardHeroCardUrl(slug), aspect: BOARD_CARD_ASPECT };
    }
    case 'Item':
      return { url: boardItemUrl(name), aspect: NONHERO_CARD_ASPECT };
    case 'Magic':
      // Call to the Fallen has no scan yet: its board url 404s until one lands
      return { url: boardMagicUrl(name), aspect: NONHERO_CARD_ASPECT };
    case 'Modifier': {
      const modifierName: Record<string, string> = {
        '2,-2': '+2-2',
        '3,-1': '+3-1',
        '1,-3': '+1-3',
        '4': '+4',
        '-4': '-4',
      };
      return {
        url: boardModifierUrl(modifierName[card.values.join(',')] ?? '+2-2'),
        aspect: NONHERO_CARD_ASPECT,
      };
    }
    case 'Challenge':
      return { url: boardChallengeUrl(), aspect: NONHERO_CARD_ASPECT };
    case 'Monster':
      return { url: boardMonsterUrl(name), aspect: MONSTER_CARD_ASPECT };
    case 'Leader':
      return { url: boardLeaderUrl(name), aspect: LEADER_CARD_ASPECT };
  }
}
