import { GameEventType, ReactionWindowType } from 'shared'
import type {
  Audience,
  GameLogEntry,
  IGameEvent,
  IGameEventListener,
} from 'shared'
import type { GameState } from '../pipelines/game-state'

// ---------------------------------------------------------------------------
// The second projection of §5, beside `playerView`: the table's story. One
// listener per game records every engine event twice —
//
//   events — verbatim, for developers: type, seat, audience, payload.
//   lines  — worded for players, for the events a player would tell of. A
//            line is written at the event, when the board still names what
//            it was about; a card that is later shuffled away keeps its name.
//
// A line names a card only to the seats that saw it: a draw names the card
// to the drawer alone, the table reads "drew a card". `entriesFor` is the
// per-seat reading; the transport ships it with the seat's snapshot.
// ---------------------------------------------------------------------------

/** One line as the table reads it, and as the seats that saw the card read it. */
export type LogLine = {
  soundWindowId?: string
  sound?: GameLogEntry['sound']
  text: string
  seen?: { by: string[]; text: string }
}

export type LogRecord = {
  seq: number
  at: number
  playerId: string
  line: LogLine
}

/** An engine event as it fired. */
export type EventRecord = {
  seq: number
  at: number
  type: GameEventType
  playerId: string
  audience: Audience
  payload: unknown
}

export class GameLog implements IGameEventListener {
  private readonly events: EventRecord[] = []
  private readonly lines: LogRecord[] = []
  private drainedEvents = 0
  private drainedLines = 0

  constructor(private readonly gs: GameState) {}

  onEvent(event: IGameEvent): void {
    const at = Date.now()
    const playerId = event.getPlayerId()
    this.events.push({
      seq: this.events.length + 1,
      at,
      type: event.getType(),
      playerId,
      audience: event.getAudience(),
      payload: event.getPayload(),
    })
    const line = logLine(this.gs, event)
    if (line) {
      this.lines.push({ seq: this.lines.length + 1, at, playerId, line })
    }
  }

  /** The whole story as `viewerId` may read it. */
  entriesFor(viewerId: string): GameLogEntry[] {
    return this.lines.map(({ seq, at, playerId, line }) => ({
      seq,
      at,
      playerId,
      text: line.seen?.by.includes(viewerId) ? line.seen.text : line.text,
      ...(line.sound ? { sound: line.sound } : {}),
      ...(line.soundWindowId ? { soundWindowId: line.soundWindowId } : {}),
    }))
  }

  /** Everything recorded since the last drain. */
  drain(): { events: EventRecord[]; lines: LogRecord[] } {
    const events = this.events.slice(this.drainedEvents)
    const lines = this.lines.slice(this.drainedLines)
    this.drainedEvents = this.events.length
    this.drainedLines = this.lines.length
    return { events, lines }
  }
}

const ROLL_WINDOWS = new Set<ReactionWindowType>([
  ReactionWindowType.Modifier,
  ReactionWindowType.Attack,
])

type Payload = Record<string, unknown>

/** How a player would tell of the event; `undefined` for the engine's own bookkeeping. */
export function logLine(gs: GameState, event: IGameEvent): LogLine | undefined {
  const p = (event.getPayload() ?? {}) as Payload
  const who = event.getPlayerId()
  const name = (id: unknown) => gs.getPlayer(String(id))?.getName() ?? String(id)
  const card = (id: unknown) => gs.getCard(String(id))?.getData().name ?? String(id)
  const cards = (ids: unknown) => (Array.isArray(ids) ? ids.map(card).join(', ') : '')
  const line = (text: string, sound?: GameLogEntry['sound']): LogLine => ({ text, ...(sound ? { sound } : {}) })

  switch (event.getType()) {
    case GameEventType.GameStarted:
      return line('The game begins')
    case GameEventType.GameEnded:
      return line(`${name(p.winnerId)} wins the game`)
    case GameEventType.TurnStarted:
      return line(`${name(who)}'s turn`)
    case GameEventType.TurnEnded:
      return line(`${name(who)} ended their turn`)
    case GameEventType.CardDrawn:
      return {
        text: `${name(who)} drew a card`,
        seen: { by: [who], text: `${name(who)} drew ${card(p.cardId)}` },
      }
    case GameEventType.HeroAddedToParty:
      if (p.reason === 'Played') return line(`${name(who)} played ${card(p.cardId)}`, 'heroPlayed')
      if (p.reason === 'Given') return line(`${card(p.cardId)} joined ${name(who)}'s party`)
      // Stolen: HeroStolen tells it.
      return undefined
    case GameEventType.MagicPlayed:
      return line(`${name(who)} played ${card(p.cardId)}`)
    case GameEventType.ItemEquippedToHero:
      return line(`${name(who)} equipped ${card(p.cardId)} to ${card(p.heroId)}`)
    case GameEventType.ItemUnequipped:
      return line(`${card(p.cardId)} came off ${card(p.heroId)}`)
    case GameEventType.LeaderActivated:
      return line(`${name(who)} activated ${card(p.cardId)}`)
    case GameEventType.DiceRolled:
      return line(`${name(who)} rolled a ${p.baseRoll} for ${card(p.cardId)}`)
    case GameEventType.ModifierPlayed:
      return { ...line(
        `${name(who)} played ${card(p.cardId)} (${signed(p.value)}) on ${name(p.targetPlayerId)}'s roll`,
        'modifierPlayed',
      ), ...(typeof p.windowId === 'string' ? { soundWindowId: p.windowId } : {}) }
    case GameEventType.ModifierApplied:
      return p.targetPlayerId === undefined
        ? line(`${signed(p.value)} to the roll: now ${p.finalRoll}`)
        : line(
            `${signed(p.value)} to ${name(p.targetPlayerId)}: the challenge stands ${p.challengerTotal} to ${p.defenderTotal}`,
          )
    case GameEventType.ReactionWindowClosed:
      if (!ROLL_WINDOWS.has(p.windowType as ReactionWindowType)) return undefined
      if (p.cancelled === true || typeof p.finalRoll !== 'number') return undefined
      return line(`${name(who)}'s roll settles at ${p.finalRoll}`)
    case GameEventType.RollSuccess:
      return line(`${name(who)} succeeded: ${card(p.cardId)}'s effect goes off`)
    case GameEventType.RollFailed:
      return line(`${name(who)} failed the roll on ${card(p.cardId)}`)
    case GameEventType.MonsterSlain:
      return line(`${name(who)} slew ${card(p.cardId)}`, 'monsterSlain')
    case GameEventType.MonsterFoughtBack:
      return line(`${card(p.cardId)} fought back against ${name(who)}`)
    case GameEventType.ChallengePlayed:
      return line(`${name(who)} challenged ${card(p.targetedCardId)} with ${card(p.cardId)}`)
    case GameEventType.ChallengeStarted:
      return line(
        `Challenge over ${card(p.cardId)}: ${name(p.challengerId)} rolled ${p.challengerRoll}, ${name(p.defenderId)} rolled ${p.defenderRoll}`,
      )
    case GameEventType.ChallengeResolved:
      return p.defenderWins
        ? line(`${name(p.defenderId)} won the challenge: ${card(p.cardId)} is played`)
        : line(`${name(p.challengerId)} won the challenge: ${card(p.cardId)} is discarded`)
    case GameEventType.CardDiscarded:
      return line(`${name(who)} discarded ${card(p.cardId)}`)
    case GameEventType.HeroSacrificed:
      return line(`${name(who)} sacrificed ${card(p.cardId)}`)
    case GameEventType.HeroDestroyed:
      return line(`${name(who)}'s ${card(p.cardId)} was destroyed`)
    case GameEventType.HeroStolen:
      return line(`${name(p.toPlayerId)} stole ${card(p.cardId)} from ${name(p.fromPlayerId)}`)
    case GameEventType.CardPulled:
      return {
        text: `${name(p.toPlayerId)} took a card from ${name(p.fromPlayerId)}'s hand`,
        seen: {
          by: [String(p.toPlayerId), String(p.fromPlayerId)],
          text: `${name(p.toPlayerId)} took ${card(p.cardId)} from ${name(p.fromPlayerId)}'s hand`,
        },
      }
    case GameEventType.CardRetrieved:
      return line(
        `${name(who)} took ${card(p.cardId)} back from ${p.from === 'Discard' ? 'the discard pile' : 'a hero'}`,
      )
    case GameEventType.HandsTraded:
      return line(`${name(who)} and ${name(p.withPlayerId)} traded hands`)
    case GameEventType.CardsRevealed: {
      const count = Array.isArray(p.cardIds) ? p.cardIds.length : 0
      if (p.toAll) return line(`Revealed to the table: ${cards(p.cardIds)}`)
      return {
        text: `${name(who)} looked at ${count} card${count === 1 ? '' : 's'}`,
        seen: { by: [who], text: `${name(who)} looked at ${cards(p.cardIds)}` },
      }
    }
    case GameEventType.EffectApplied:
      return line(`${card(p.sourceCardId)}'s effect is on ${name(who)}`)
    default:
      return undefined
  }
}

function signed(value: unknown): string {
  const n = Number(value)
  return n > 0 ? `+${n}` : String(n)
}
