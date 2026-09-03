import { Injectable, Logger } from '@nestjs/common'
import { GameCommandSchema, INTERNAL_ERROR } from 'shared'
import type { CommandResult, GameCommand, RequestResult } from 'shared'
import type { ZodError } from 'zod'
import type { Game } from '../game/setup/create-game'
import {
  AttackMonsterAction,
  DrawCardAction,
  EndTurnAction,
  PlayHeroAction,
  PlayItemAction,
  PlayMagicAction,
  RedrawHandAction,
  RollOnHeroAction,
  RollOnLeaderAction,
} from '../game/actions'
import { PlayChallengeReaction } from '../game/reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../game/reactions/play-modifier-reaction'

// ---------------------------------------------------------------------------
// The controller of the socket world: one wire command in, one engine door
// call, one ack out. Three layers, each answering its own question:
//
//   shape     — zod. A failure is the client's bug, reported as InternalError.
//   identity  — the authenticated account is the player id. Never the payload.
//   legality  — the engine, through its doors. A refusal comes back by name.
//
// An engine THROW is an engine bug: logged here with the command that caused
// it, and reported to the client as InternalError, never as a refusal and
// never as a dropped connection.
//
// Reaches the engine only through the doors the play-through harness uses:
// `turnManager.enqueue`, `reactionManager.submitReaction` and `submitChoice`.
// `game.gameState` is never read.
// ---------------------------------------------------------------------------

@Injectable()
export class CommandDispatcherService {
  private readonly logger = new Logger(CommandDispatcherService.name)

  dispatch(game: Game, accountId: string, raw: unknown): CommandResult {
    const parsed = GameCommandSchema.safeParse(raw)
    if (!parsed.success) {
      this.logger.warn(
        `malformed command from ${accountId} in ${game.gameId}: ${describe(parsed.error)}`,
      )
      return {
        commandId: commandIdOf(raw),
        accepted: false,
        error: INTERNAL_ERROR,
      }
    }

    const command = parsed.data
    try {
      return {
        commandId: command.commandId,
        ...this.route(game, accountId, command),
      }
    } catch (error) {
      this.logger.error(
        `engine threw on ${command.type} from ${accountId} in ${game.gameId}`,
        error instanceof Error ? error.stack : String(error),
      )
      return {
        commandId: command.commandId,
        accepted: false,
        error: INTERNAL_ERROR,
      }
    }
  }

  /**
   * Builds the engine's own request object for the authenticated player and
   * puts it through the matching door. Constructor slots the engine needs
   * (emitter, reaction manager) come from the game, never from the wire. The
   * command id doubles as the action id, so the two correlate in the log.
   */
  private route(
    game: Game,
    playerId: string,
    command: GameCommand,
  ): RequestResult {
    const { emitter, reactionManager, turnManager } = game
    const id = command.commandId

    switch (command.type) {
      case 'DrawCard':
        return turnManager.enqueue(new DrawCardAction(id, playerId, emitter))
      case 'PlayHero':
        return turnManager.enqueue(
          new PlayHeroAction(
            id,
            playerId,
            command.payload.cardId,
            reactionManager,
            emitter,
          ),
        )
      case 'PlayItem':
        return turnManager.enqueue(
          new PlayItemAction(
            id,
            playerId,
            command.payload.cardId,
            command.payload.targetHeroId,
            reactionManager,
            emitter,
          ),
        )
      case 'PlayMagic':
        return turnManager.enqueue(
          new PlayMagicAction(
            id,
            playerId,
            command.payload.cardId,
            reactionManager,
            emitter,
          ),
        )
      case 'RollOnHero':
        return turnManager.enqueue(
          new RollOnHeroAction(
            id,
            playerId,
            command.payload.heroId,
            emitter,
            reactionManager,
          ),
        )
      case 'RollOnLeader':
        return turnManager.enqueue(
          new RollOnLeaderAction(
            id,
            playerId,
            command.payload.leaderId,
            emitter,
          ),
        )
      case 'AttackMonster':
        return turnManager.enqueue(
          new AttackMonsterAction(
            id,
            playerId,
            command.payload.monsterId,
            reactionManager,
            emitter,
          ),
        )
      case 'ReDraw':
        return turnManager.enqueue(new RedrawHandAction(id, playerId, emitter))
      case 'EndTurn':
        return turnManager.enqueue(new EndTurnAction(id, playerId))
      case 'ApplyModifier':
        return reactionManager.submitReaction(
          new PlayModifierReaction(
            id,
            playerId,
            command.payload.cardId,
            command.payload.targetPlayerId,
            command.payload.value,
          ),
        )
      case 'Challenge':
        return reactionManager.submitReaction(
          new PlayChallengeReaction(
            id,
            playerId,
            command.payload.cardId,
            command.payload.targetedCardId,
          ),
        )
      case 'SubmitChoice':
        return reactionManager.submitChoice(
          command.payload.windowId,
          playerId,
          command.payload.choice,
        )
    }
    // Exhaustive: a command added to the schema without a door here is a
    // compile error, not a request that vanishes.
    const unhandled: never = command
    throw new Error(`no door for command ${JSON.stringify(unhandled)}`)
  }
}

/** The id off an envelope that failed the schema, when it at least has one. */
function commandIdOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { commandId } = raw as { commandId?: unknown }
  return typeof commandId === 'string' ? commandId : undefined
}

function describe(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
    .join('; ')
}
