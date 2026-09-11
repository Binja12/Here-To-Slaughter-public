import { CardView } from '../contract';
import { assetUrl } from '../assetUrl';

// Every card on the table is drawn from its BOARD scan under client/public/
// board/. There is no template art any more (the owner, 2026-09-04: the old
// /cards folder is gone); a card without a scan draws a placeholder that names
// itself, so the table never shows a broken image.

/* ------------------------------------------------------------------ */
/* BOARD design (client/public/board/): premium scans, frame baked in  */
/* ------------------------------------------------------------------ */

export const SMALL_BACK = assetUrl('/board/Small Card Back.png'); // any regular pile
export const BIG_BACK = assetUrl('/board/Big Card Back.png'); // monster deck only
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
    ? assetUrl('/board/heroes/Hero Guardian Light.png') // typo on disk
    : assetUrl(`/board/heroes/Hero ${BOARD_HERO_OVERRIDES[slug] ?? titleCase(slug)}.png`);

/** name like "Mega Slime" → /board/Monsters/Monster Mega Slime.png */
export const boardMonsterUrl = (name: string) =>
  name === 'Warworn Owlbear' // file lacks the "Monster " prefix
    ? assetUrl('/board/Monsters/Warworn Owlbear.png')
    : assetUrl(`/board/Monsters/Monster ${name}.png`);

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
export const boardItemUrl = (name: string) => assetUrl(`/board/Items/Item ${name}.png`);

export const MAGICS = [
  'Call Of The Fallen',
  'Critical Boost',
  'Destructive Spell',
  'Enchanted Spell',
  'Entangling Trap',
  'Forced Exchange',
  'Forceful Winds',
  'Winds Of Change',
] as const;
export const boardMagicUrl = (name: string) => assetUrl(`/board/Magics/Magic ${name}.png`);
const hasMagicScan = (name: string) => (MAGICS as readonly string[]).includes(name);

/** A stand-in for a card whose scan has not landed: a plain card face that
 *  names the card, drawn inline so nothing needs to be on disk. */
export const placeholderCardUrl = (kind: string, name: string): string => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const words = name.split(' ');
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= 14) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const title = lines
    .map((line, i) => `<tspan x="543" dy="${i === 0 ? 0 : 130}">${esc(line)}</tspan>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1086 1448">` +
    `<rect width="1086" height="1448" rx="60" fill="#2b1d12"/>` +
    `<rect x="36" y="36" width="1014" height="1376" rx="44" fill="#e9d7b1" stroke="#b58a3c" stroke-width="18"/>` +
    `<text x="543" y="180" text-anchor="middle" font-family="Georgia, serif" font-size="96" font-weight="bold" fill="#5a3a12">${esc(kind.toUpperCase())}</text>` +
    `<text x="543" y="700" text-anchor="middle" font-family="Georgia, serif" font-size="112" font-weight="bold" fill="#3b2a14">${title}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const MODIFIERS = ['+1-3', '+2-2', '+3-1', '+4', '-4'] as const;
export const boardModifierUrl = (name: string) =>
  assetUrl(`/board/Modifiers/Modifier ${name}.png`);

export const boardChallengeUrl = (name = 'Basic') =>
  assetUrl(`/board/challenge/Challenge ${name}.png`);

export const LEADER_CARD_ASPECT = 1024 / 1536;

/** name like "The Divine Arrow" → /board/Leaders/Leader The Divine Arrow.png */
export const boardLeaderUrl = (name: string) =>
  assetUrl(`/board/Leaders/Leader ${name}.png`);

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
  // the scan says "Of The", the card says "to the"
  'Call to the Fallen': 'Call Of The Fallen',
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
      return {
        url: hasMagicScan(name) ? boardMagicUrl(name) : placeholderCardUrl(card.type, card.name),
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
