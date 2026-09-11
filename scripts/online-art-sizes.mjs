// Full image canvas bounds at a 1920x1080 CSS viewport, including the largest
// hover/overlay transform. Keep these in sync with the layouts cited below.
//
// ONE profile: a 720p stage, plus each image's own full size. The exports are
// committed (client/public/generated/online-art), so the build encodes nothing
// — that is the whole point of there being one profile rather than four
// (the owner, 2026-09-08). Adding art means running `npm run assets:art` and
// committing what it writes.
export const STAGE_PIXEL_HEIGHTS = [720];

export function largestView(file) {
  // Backgrounds and the lobby canvas are sent at FULL size (a null bound):
  // they already stretch past their masters at 1080p, and a 720p copy of the
  // felt is the one downscale the eye catches (the owner, 2026-09-08).
  // HeroRow: 35cqh * .65 inset * .92 card * 2.3 hover = 520px high.
  // PlayerHand: 28cqh * 1.6 = 484px; challenge/modifier: 42cqh = 454px.
  // The 400x560 envelope includes headroom and the differing scan aspects.
  if (/^board\/(heroes|Items|Magics|Modifiers|challenge)\//.test(file)) {
    return { width: 400, height: 560, reason: 'hand, hero hover, challenge, modifier, discard and choice views' };
  }
  // Board/layout: 29cqh * .88 inset * 3 hover = 827px high, 481px wide.
  if (file.startsWith('board/Monsters/')) {
    return { width: 500, height: 850, reason: '3x monster hover, trophies and roll overlays' };
  }
  // Board: leader inset is .66 x .74; hover matches the monster frame height
  // before that inset (29 * .88 * 3 / leader.h), yielding 364x612px.
  if (file.startsWith('board/Leaders/')) {
    return { width: 400, height: 640, reason: 'leader hover, trophies and roll overlays' };
  }
  if (/^board\/(Small Card Back|Big Card Back|card-back)\.png$/.test(file)) {
    return { width: 400, height: 560, reason: 'hand stacks, deck piles and card overlays' };
  }
  const widgets = {
    'Heroes Frame': [1152, 384],
    'Leader Card Frame': [336, 504],
    'Small Card Back Frame': [288, 400],
    'Big Card Frame': [192, 324],
    'Center Border Frame': [704, 704],
    'Action Pointer Border': [224, 56],
    'Action Point Gem': [48, 48],
    'Your Turn Show': [272, 68],
    'End Turn Button': [180, 60],
    'Skip Reaction Button': [180, 60],
    'Redraw Button': [180, 60],
  };
  const widget = /^board\/Border Widgets\/(.+)\.png$/.exec(file)?.[1];
  if (widgets[widget]) {
    const [width, height] = widgets[widget];
    return { width, height, reason: 'layout.ts widget envelope, including button hover' };
  }
  // Perspective can enlarge rotating cube faces beyond the resting die size.
  if (file.startsWith('board/Dice/')) {
    return { width: 160, height: 160, reason: 'dice toss, perspective and 1.04x bounce' };
  }
  if (/^board\/Discard Pile\/.+ Button\.png$/.test(file)) {
    return { width: 384, height: 96, reason: 'discard plaque canvas, inkScale and 1.06x hover' };
  }
  // Lobby widget bounds are for the ENTIRE padded source canvas, not just ink.
  const lobby = {
    'Player Frame.png': [672, 379],
    'Settings.png': [640, 854],
    'Button Start Game.png': [640, 214],
    'add player.png': [160, 160],
    'remove player.png': [176, 176],
  };
  if (file.startsWith('lobby/') && lobby[file.slice(6)]) {
    const [width, height] = lobby[file.slice(6)];
    return { width, height, reason: 'lobbyLayout/lobbyAssets full canvas after CSS crop' };
  }
  const volume = {
    'music/Volume outline.png': [304, 131],
    'music/Volume Bar.png': [256, 110],
    'music/Volume Knob.png': [64, 64],
  };
  if (volume[file]) {
    const [width, height] = volume[file];
    return { width, height, reason: 'volume.css sprite scaling and HUD volume widget' };
  }
  // Backgrounds already stretch beyond their masters at 1080p. Unused/reference
  // art has no proven display bound; preserve its resolution instead of guessing.
  return null;
}

export function exportWidth(source, bounds, stagePixelHeight) {
  if (!bounds) return source.width;
  const scale = stagePixelHeight / 1080;
  const required = Math.max(bounds.width, bounds.height * source.width / source.height) * scale;
  return Math.min(source.width, Math.ceil(required / 64) * 64);
}
