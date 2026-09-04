import { GameEventType, PassiveType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { AbilityContext } from '../../abilities/ability-context'
import { GameEventEmitter } from '../../events/game-event-emitter'
import type { ReactionManager } from '../../pipelines/reaction-manager'
import { TerratugaAbility } from './terratuga-ability'

// ---------------------------------------------------------------------------
// Terratuga (monster-130): once slain, its slayer's heroes cannot be destroyed.
// No clock — Warworn Owlbear's shape. DestroyTask honours the effect
// (hero-tasks.spec.ts); this checks the declaration.
// ---------------------------------------------------------------------------

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

function seated(): GameState {
  const gs = makeGs()
  gs.registerPlayer(
    new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }),
  )
  gs.registerParty(
    new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }),
  )
  return gs
}

const stubRm = {} as ReactionManager

function run(gs: GameState, rules: typeof TerratugaAbility, sourceCardId: string) {
  const ctx = new AbilityContext(sourceCardId, 'p1')
  const em = new GameEventEmitter()
  for (const step of rules[0].steps) step.execute(gs, ctx, em, stubRm)
}

describe('Terratuga (monster-130)', () => {
  it('fires when it is slain', () => {
    expect(TerratugaAbility[0].trigger.on).toBe(GameEventType.MonsterSlain)
  })

  it('installs CantBeDestroyed on the slayer with no clock', () => {
    const gs = seated()
    run(gs, TerratugaAbility, 'monster-130')

    const [effect] = gs.getEffects(PassiveType.CantBeDestroyed, 'p1')
    expect(effect).toMatchObject({ ownerId: 'p1', sourceCardId: 'monster-130' })
    expect(effect.expiry).toBeUndefined()
  })
})
