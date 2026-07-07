// Domain mapping layer: pure functions that adapt the server snapshot/catalog
// (client/src/types.ts DTOs) into what the presentational components need.
// No component in tabletop/ should re-derive game rules — it happens here.

import {
  CardData,
  GameEventDto,
  GameSnapshot,
  PartyDto,
  PlayerDto,
} from '../types'

export const ALL_CLASSES = [
  'Fighter',
  'Guardian',
  'Ranger',
  'Thief',
  'Wizard',
  'Bard',
] as const

export type HeroClassName = (typeof ALL_CLASSES)[number]

export type SeatSide = 'bottom' | 'top' | 'left' | 'right'

export type Seat = {
  side: SeatSide
  player: PlayerDto | null
  party: PartyDto | null
}

/** Per-player accent colors (reference: P1 red, P2 purple, P3 blue, P4 gold). */
const PLAYER_ACCENTS: Record<string, string> = {
  p1: '#a03a31',
  p2: '#6e4a99',
  p3: '#3d6cad',
  p4: '#b8892e',
}
const FALLBACK_ACCENTS = ['#a03a31', '#6e4a99', '#3d6cad', '#b8892e']

export function accentFor(playerId: string, index: number): string {
  return PLAYER_ACCENTS[playerId] ?? FALLBACK_ACCENTS[index % 4]
}

/**
 * Seat players around the table. The local player always takes the bottom
 * seat (their hand and controls live there); remaining players fill the
 * top, left and right edges in join order. Missing seats stay empty so the
 * table keeps its four-sided composition.
 */
export function assignSeats(
  snapshot: GameSnapshot,
  localPlayerId: string,
): Seat[] {
  const partyOf = (id: string) =>
    snapshot.parties.find((p) => p.playerId === id) ?? null

  const others = snapshot.players.filter((p) => p.id !== localPlayerId)
  const local = snapshot.players.find((p) => p.id === localPlayerId) ?? null
  // Reference layout: P2 top, P3 right — remaining player takes the left edge.
  const otherSides: SeatSide[] = ['top', 'right', 'left']

  const seats: Seat[] = [
    { side: 'bottom', player: local, party: local ? partyOf(local.id) : null },
  ]
  otherSides.forEach((side, i) => {
    const player = others[i] ?? null
    seats.push({ side, player, party: player ? partyOf(player.id) : null })
  })
  return seats
}

// ---------------------------------------------------------------------------
// Party / win-condition helpers
// ---------------------------------------------------------------------------

export function partyMemberClasses(
  party: PartyDto,
  cardOf: (id: string) => CardData | undefined,
): string[] {
  return [party.leaderId, ...party.heroIds]
    .map((id) => cardOf(id)?.heroClass)
    .filter((c): c is string => !!c)
}

export function distinctClasses(memberClasses: string[]): Set<string> {
  return new Set(memberClasses)
}

/**
 * "Requires Fighter + Any + Any" style check: every named class must be
 * matched by a distinct party member, and each "Any" by any leftover member.
 */
export function meetsPartyReq(
  reqClasses: string[],
  memberClasses: string[],
): boolean {
  const pool = [...memberClasses]
  const named = reqClasses.filter((c) => c !== 'Any')
  for (const cls of named) {
    const i = pool.indexOf(cls)
    if (i === -1) return false
    pool.splice(i, 1)
  }
  const anyCount = reqClasses.length - named.length
  return pool.length >= anyCount
}

// ---------------------------------------------------------------------------
// Action availability (disabled reasons)
// ---------------------------------------------------------------------------

export type Availability = { enabled: boolean; reason?: string }

export type TurnContext = {
  isMyTurn: boolean
  reactionOpen: boolean
  actionPoints: number
}

function gated(ctx: TurnContext, apCost: number): Availability | null {
  if (!ctx.isMyTurn) return { enabled: false, reason: 'Not your turn.' }
  if (ctx.reactionOpen)
    return { enabled: false, reason: "Waiting for another player's response." }
  if (ctx.actionPoints < apCost)
    return {
      enabled: false,
      reason: `Requires ${apCost} action point${apCost > 1 ? 's' : ''}.`,
    }
  return null
}

export function canDraw(ctx: TurnContext): Availability {
  return gated(ctx, 1) ?? { enabled: true }
}

export function canPlayCard(ctx: TurnContext, card?: CardData): Availability {
  const gate = gated(ctx, 1)
  if (gate) return gate
  if (!card) return { enabled: false, reason: 'Select a card in your hand.' }
  if (card.type === 'Modifier' || card.type === 'Challenge')
    return {
      enabled: false,
      reason: `${card.type} cards are played as reactions — they cost no action points.`,
    }
  if (card.type !== 'Hero' && card.type !== 'Magic' && card.type !== 'Item')
    return { enabled: false, reason: 'This card cannot be played.' }
  return { enabled: true }
}

export function canUseHeroEffect(
  ctx: TurnContext,
  heroId: string | null,
  usedThisTurn: string[],
): Availability {
  const gate = gated(ctx, 1)
  if (gate) return gate
  if (!heroId)
    return { enabled: false, reason: 'Select a hero in your party.' }
  if (usedThisTurn.includes(heroId))
    return {
      enabled: false,
      reason: 'This Hero effect was already used this turn.',
    }
  return { enabled: true }
}

export function canAttackMonster(
  ctx: TurnContext,
  monster: CardData | null,
  memberClasses: string[],
): Availability {
  const gate = gated(ctx, 2)
  if (gate) return gate
  if (!monster)
    return { enabled: false, reason: 'Select a monster to attack.' }
  const req = monster.partyReq?.classes ?? []
  if (!meetsPartyReq(req, memberClasses))
    return {
      enabled: false,
      reason: "You do not meet this monster's party requirement.",
    }
  return { enabled: true }
}

export function canEndTurn(ctx: TurnContext): Availability {
  if (!ctx.isMyTurn) return { enabled: false, reason: 'Not your turn.' }
  if (ctx.reactionOpen)
    return { enabled: false, reason: "Waiting for another player's response." }
  return { enabled: true }
}

// ---------------------------------------------------------------------------
// Event log narration
// ---------------------------------------------------------------------------

export type LogEntry = {
  key: number
  playerId: string
  text: string
  icon: string
}

export function describeEvent(
  e: GameEventDto,
  cardOf: (id: string) => CardData | undefined,
  nameOf: (playerId: string) => string,
): { text: string; icon: string } | null {
  const p = e.payload ?? {}
  const cardId = p.cardId as string | undefined
  const card = cardId ? cardOf(cardId)?.name ?? 'a card' : 'a card'
  const who = nameOf(e.playerId)

  switch (e.type) {
    case 'GameStarted':
      return { text: 'A new hunt begins.', icon: '⚑' }
    case 'TurnStarted':
      return { text: `${who}'s turn begins.`, icon: '⌛' }
    case 'TurnEnded':
      return { text: `${who} ended their turn.`, icon: '⌛' }
    case 'CardDrawn':
      return { text: `${who} drew a card.`, icon: '🂠' }
    case 'HeroAddedToParty':
      return { text: `${who} recruited ${card}.`, icon: '✦' }
    case 'ItemEquippedToHero':
      return { text: `${who} equipped ${card}.`, icon: '⚒' }
    case 'MagicPlayed':
      return { text: `${who} cast ${card}.`, icon: '✴' }
    case 'CardDiscarded':
      return { text: `${who} discarded ${card}.`, icon: '↓' }
    case 'DiceRolled':
      return {
        text: `${who} rolled ${(p.baseRoll as number) ?? '?'}.`,
        icon: '⚄',
      }
    case 'ModifierApplied':
      return {
        text: `${who} played a modifier — roll is now ${p.finalRoll}.`,
        icon: '±',
      }
    case 'ModifierWindowClosed':
      return { text: `Roll settled at ${p.finalRoll}.`, icon: '⚄' }
    case 'RollSuccess':
      return { text: `${card}'s effect triggers!`, icon: '✨' }
    case 'MonsterSlain':
      return { text: `${who} slew ${card}!`, icon: '🏆' }
    case 'MonsterAttackFail':
      return { text: `${card} fights back at ${who}!`, icon: '💥' }
    case 'HeroDestroyed':
      return { text: `${card} was destroyed.`, icon: '✝' }
    case 'HeroStolen':
      return { text: `${who} stole ${card}.`, icon: '🗡' }
    case 'ChallengeStarted':
      return { text: `${who} issued a challenge over ${card}!`, icon: '⚔' }
    case 'ChallengeResolved': {
      const defenderWins = p.defenderWins as boolean | undefined
      return {
        text: defenderWins
          ? `Challenge failed — ${card} resolves.`
          : `Challenge won — ${card} is blocked!`,
        icon: '⚔',
      }
    }
    case 'GameEnded':
      return { text: `The game is over.`, icon: '👑' }
    default:
      return null
  }
}
