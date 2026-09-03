import { GameEventType, PassiveType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { AbilityContext } from '../../abilities/ability-context'
import { GameEventEmitter } from '../../events/game-event-emitter'
import type { ReactionManager } from '../../pipelines/reaction-manager'
import { CorruptedSabretoothAbility } from './corrupted-sabretooth-ability'

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const stubRm = {} as ReactionManager

// Corrupted Sabretooth (monster-122): "Each time you would DESTROY a Hero
// card, you may STEAL that Hero card instead." What the effect DOES is
// DestroyTask's business (hero-tasks.spec.ts); this checks the declaration.

describe('Corrupted Sabretooth (monster-122)', () => {
  it('fires when it is slain and installs StealsInsteadOfDestroy on the slayer, no clock', () => {
    expect(CorruptedSabretoothAbility[0].trigger.on).toBe(GameEventType.MonsterSlain)
    const gs = makeGs()
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))

    for (const step of CorruptedSabretoothAbility[0].steps) {
      step.execute(gs, new AbilityContext('monster-122', 'p1'), new GameEventEmitter(), stubRm)
    }

    const [effect] = gs.getEffects(PassiveType.StealsInsteadOfDestroy, 'p1')
    expect(effect).toMatchObject({ ownerId: 'p1', sourceCardId: 'monster-122' })
    expect(effect.expiry).toBeUndefined()
  })
})
