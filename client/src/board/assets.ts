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
