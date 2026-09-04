import { GameEventType, TriggerScope } from 'shared'
import { AbilityContext } from '../../abilities/ability-context'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { IAbilityRule, IEffect, IReactionManager } from '../../interfaces'
import { GameState } from '../../pipelines/game-state'
import { CardPile } from '../../state-structures/card-pile'
import { CardStack } from '../../state-structures/card-stack'
import { Party } from '../../state-structures/party'
import { Player } from '../../state-structures/player'
import { abilityRegistry } from './index'

export type ExpectedEntry = {
  on: GameEventType
  scope: TriggerScope
  when?: string
  steps: string[]
}

export function expectAbility(
  cardId: string,
  ability: IAbilityRule[],
  expected: ExpectedEntry[],
): void {
  expect(abilityRegistry.get(cardId)).toBe(ability)
  expect(
    ability.map((entry) => ({
      on: entry.trigger.on,
      scope: entry.trigger.scope,
      ...(entry.trigger.when !== undefined && { when: entry.trigger.when }),
      steps: entry.steps.map((step) => step.constructor.name),
    })),
  ).toEqual(expected)
}

export function effectInstalledBy(cardId: string): IEffect {
  const gs = new GameState(
    new CardStack('deck', 'deck'),
    new CardPile('discard', 'discard'),
    new CardStack('monster-deck', 'monster deck'),
    new CardPile('monster-row', 'monster row'),
  )
  const player = new Player({
    id: 'p1',
    name: 'P1',
    hand: [],
    partyId: 'party-1',
    actionPoints: 3,
  })
  gs.registerPlayer(player)
  gs.registerParty(
    new Party({
      playerId: 'p1',
      leaderId: 'leader-1',
      heroIds: [],
      monsterIds: [],
    }),
  )

  const step = abilityRegistry.get(cardId)?.[0].steps[0]
  if (!step) throw new Error(`${cardId} has no effect-installing step`)
  step.execute(
    gs,
    new AbilityContext(cardId, 'p1'),
    new GameEventEmitter(),
    null as unknown as IReactionManager,
  )

  const effect = player.getAllEffects()[0]
  if (!effect) throw new Error(`${cardId} installed no effect`)
  return effect
}

export function expiryEvents(effect: IEffect): GameEventType[] {
  return (effect.expiry ?? []).map((expiry) => expiry.on)
}
