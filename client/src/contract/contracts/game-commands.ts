import { RefusalReason } from '../enums'

export type GameCommand =
  | { commandId: string; type: 'DrawCard'; payload: {} }
  | { commandId: string; type: 'PlayHero'; payload: { cardId: string } }
  | {
      commandId: string
      type: 'PlayItem'
      payload: { cardId: string; targetHeroId: string }
    }
  | { commandId: string; type: 'PlayMagic'; payload: { cardId: string } }
  | { commandId: string; type: 'RollOnHero'; payload: { heroId: string } }
  | {
      commandId: string
      type: 'RollOnLeader'
      payload: { leaderId: string }
    }
  | {
      commandId: string
      type: 'AttackMonster'
      payload: { monsterId: string }
    }
  | { commandId: string; type: 'ReDraw'; payload: {} }
  | { commandId: string; type: 'EndTurn'; payload: {} }
  | {
      commandId: string
      type: 'ApplyModifier'
      payload: { cardId: string; targetPlayerId: string; value: number }
    }
  | {
      commandId: string
      type: 'Challenge'
      payload: { cardId: string; targetedCardId: string }
    }
  | {
      commandId: string
      type: 'SubmitChoice'
      payload: { windowId: string; choice: unknown }
    }
  | { commandId: string; type: 'LeaveGame'; payload: {} }

export type GameCommandInput = GameCommand extends infer Command
  ? Command extends { commandId: string }
    ? Omit<Command, 'commandId'>
    : never
  : never

export type CommandResult =
  | { commandId: string; accepted: true }
  | { commandId: string; accepted: false; reason: RefusalReason }
  | { commandId?: string; accepted: false; error: 'InternalError' }
