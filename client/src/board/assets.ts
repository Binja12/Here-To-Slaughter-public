import { CardView } from '../contract';

/**
 * Manifest of the hero card scans under client/public/cards/heroes/.
 * The user maintains the folder as <class>/<NN>_<snake_name>.png where NN
 * is the file's position in the arrays below — keep the order in sync with
 * the folder. Leaders/monsters currently only have the root template scans
 * (/cards/leader.png, /cards/monster.png).
 */

const CLASS_HEROES: Record<string, string[]> = {
  Bard: [
    'napping_nibbles',
    'peanut',
    'fuzzy_cheeks',
    'greedy_cheeks',
    'lucky_bucky',
    'dodgy_dealer',
    'mellow_dee',
    'tipsy_tootie',
  ],
  Fighter: [
    'heavy_bear',
    'pan_chucks',
    'beary_wise',
    'qi_bear',
    'fury_knuckle',
    'tough_teddy',
    'bad_axe',
    'bear_claw',
  ],
  Guardian: [
    'wise_shield',
    'calming_voice',
    'radiant_horn',
    'mighty_blade',
    'holy_curselifter',
    'iron_resolve',
    'guiding_light',
    'vibrant_glow',
  ],
  Ranger: [
    'wildshot',
    'sharp_fox',
    'lookie_rookie',
    'wily_red',
    'quick_draw',
    'bullseye',
    'serious_grey',
    'hook',
  ],
  Thief: [
    'plundering_puma',
    'smooth_mimimeow',
    'meowzio',
    'shurikitty',
    'sly_pickings',
    'slippery_paws',
    'kit_napper',
    'silent_shadow',
  ],
  Wizard: [
    'wiggles',
    'snowball',
    'spooky',
    'bun_bun',
    'buttons',
    'fluffy',
    'hopper',
    'whiskers',
  ],
};

export interface HeroAsset {
  heroClass: string;
  url: string;
}

/** kebab-case slug (e.g. "fuzzy-cheeks") → class + scan url */
export const HEROES: Record<string, HeroAsset> = {};
for (const [heroClass, names] of Object.entries(CLASS_HEROES)) {
  names.forEach((snake, i) => {
    const nn = String(i + 1).padStart(2, '0');
    HEROES[snake.replace(/_/g, '-')] = {
      heroClass,
      url: `/cards/heroes/${heroClass.toLowerCase()}/${nn}_${snake}.png`,
    };
  });
}

/** HAND design (also used for the discard pile). */
export const heroCardUrl = (slug: string): string =>
  HEROES[slug]?.url ?? '/cards/hero.png'; // template fallback

export const heroClassOf = (slug: string): string =>
  HEROES[slug]?.heroClass ?? 'Bard';

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
const BOARD_HERO_MISSING = new Set(['guiding-light']);

/** Board-design hero scan, or null when the art doesn't exist yet. */
export const boardHeroCardUrl = (slug: string): string | null => {
  if (!HEROES[slug] || BOARD_HERO_MISSING.has(slug)) return null;
  return `/board/heroes/Hero ${BOARD_HERO_OVERRIDES[slug] ?? titleCase(slug)}.png`;
};

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
      return {
        url:
          slug === 'guiding-light'
            ? '/board/heroes/Hero Guardian Light.png'
            : boardHeroCardUrl(slug) ?? heroCardUrl(slug),
        aspect: BOARD_CARD_ASPECT,
      };
    }
    case 'Item':
      return { url: boardItemUrl(name), aspect: NONHERO_CARD_ASPECT };
    case 'Magic':
      return {
        url:
          card.name === 'Call to the Fallen'
            ? '/cards/magic.png'
            : boardMagicUrl(name),
        aspect: NONHERO_CARD_ASPECT,
      };
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
