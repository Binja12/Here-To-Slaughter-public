import { z } from "zod";
import type { RefusalReason } from "../enums";
import type { RequestResult } from "../types";

// ---------------------------------------------------------------------------
// What a browser sends a game server, and what it gets back. SHAPE only —
// whether the play is legal is the engine's answer, carried in the ack.
//
// Envelope: `{ commandId, type, payload }`. `commandId` is minted by the
// client (crypto.randomUUID) and comes back on the ack, so a retry can be
// told from a new request and a reply can be matched to what it answers.
// ---------------------------------------------------------------------------

const id = z.string().trim().min(1);

/** One command: the envelope with its own payload shape. */
const command = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ commandId: z.uuid(), type: z.literal(type), payload });

/** The commands that reach an engine door. The dispatcher's whole vocabulary. */
export const EngineCommandSchema = z.discriminatedUnion("type", [
  // actions — TurnManager.enqueue
  command("DrawCard", z.object({})),
  command("PlayHero", z.object({ cardId: id })),
  command("PlayItem", z.object({ cardId: id, targetHeroId: id })),
  command("PlayMagic", z.object({ cardId: id })),
  command("RollOnHero", z.object({ heroId: id })),
  command("RollOnLeader", z.object({ leaderId: id })),
  command("AttackMonster", z.object({ monsterId: id })),
  command("ReDraw", z.object({})),
  command("EndTurn", z.object({})),
  // reactions — ReactionManager.submitReaction
  command(
    "ApplyModifier",
    z.object({ cardId: id, targetPlayerId: id, value: z.number().int() }),
  ),
  command("Challenge", z.object({ cardId: id, targetedCardId: id })),
  // a choice — ReactionManager.submitChoice. What a legal choice IS depends
  // on the window, and only the engine knows that.
  command("SubmitChoice", z.object({ windowId: id, choice: z.unknown() })),
]);

/**
 * The one command that is not an engine call: a seat leaving a CONCLUDED
 * table, which returns the account to the lobby. The game server answers it
 * itself, refusing `GameNotOver` while the table is live.
 */
export const LeaveGameSchema = command("LeaveGame", z.object({}));

/** Everything a client may send on `game:command`. */
export const GameCommandSchema = z.discriminatedUnion("type", [
  ...EngineCommandSchema.options,
  LeaveGameSchema,
]);

export type EngineCommand = z.infer<typeof EngineCommandSchema>;
export type GameCommand = z.infer<typeof GameCommandSchema>;
export type GameCommandType = GameCommand["type"];

/**
 * A command that could not be handled: the envelope failed the schema, or the
 * engine threw. The client learns only that it happened; what went wrong
 * stays in the server's log. A correct client never sees this.
 */
export const INTERNAL_ERROR = "InternalError";

export type CommandResult =
  | ({ commandId: string } & RequestResult)
  | {
      /** Absent when the envelope itself was unreadable. */
      commandId?: string;
      accepted: false;
      error: typeof INTERNAL_ERROR;
    };

/** Narrowing helper for the client and the tests. */
export const isRefusal = (
  result: CommandResult,
): result is { commandId: string; accepted: false; reason: RefusalReason } =>
  !result.accepted && "reason" in result;
