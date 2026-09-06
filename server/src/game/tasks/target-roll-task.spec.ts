import { Zone } from 'shared'
import { TargetRollTask } from './target-roll-task'
import { GameState } from '../pipelines/game-state'
import { AbilityContext, CTX_CHOSEN_PLAYER } from '../abilities/ability-context'
import { GameEventEmitter } from '../events/game-event-emitter'
import { IReactionManager } from '../interfaces'

describe('TargetRollTask', () => {
  it('hands the slot the card named to the board with the zone the effect reaches, an empty pick included', () => {
    const gs = {} as GameState
    const landed: unknown[] = []
    ;(gs as unknown as { landRollTarget: (key: string, picks: unknown[], zone: Zone) => void }).landRollTarget = (
      key,
      picks,
      zone,
    ) => {
      landed.push([key, picks, zone])
    }
    const em = new GameEventEmitter()
    const rm = {} as IReactionManager

    const chosen = new AbilityContext('hero-1', 'p1')
    chosen.set(CTX_CHOSEN_PLAYER, ['p2'])
    new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Hand).execute(gs, chosen, em, rm)

    new TargetRollTask(CTX_CHOSEN_PLAYER, Zone.Party).execute(gs, new AbilityContext('hero-1', 'p1'), em, rm)

    expect(landed).toEqual([[CTX_CHOSEN_PLAYER, ['p2'], Zone.Hand], [CTX_CHOSEN_PLAYER, [], Zone.Party]])
  })
})
