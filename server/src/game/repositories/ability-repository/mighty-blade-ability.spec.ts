import { GameEventType, PassiveType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { AbilityContext } from '../../abilities/ability-context'
import { GameEventEmitter } from '../../events/game-event-emitter'
import type { ReactionManager } from '../../pipelines/reaction-manager'
import { MightyBladeAbility } from './mighty-blade-ability'

// ---------------------------------------------------------------------------
// Mighty Blade (hero-031): installs CantBeDestroyed on the owner until the
// owner's next turn. What the rule DOES is DestroyTask's business
// (hero-tasks.spec.ts): this only checks the declaration installs the right
// effect for the right owner.
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

function run(gs: GameState, rules: typeof MightyBladeAbility, sourceCardId: string) {
  const ctx = new AbilityContext(sourceCardId, 'p1')
  const em = new GameEventEmitter()
  for (const step of rules[0].steps) step.execute(gs, ctx, em, stubRm)
}

describe('Mighty Blade (hero-031)', () => {
  it('fires on its own successful roll', () => {
    expect(MightyBladeAbility[0].trigger.on).toBe(GameEventType.RollSuccess)
  })

  it('installs CantBeDestroyed on the owner, for every hero, until the owner\'s next turn', () => {
    const gs = seated()
    run(gs, MightyBladeAbility, 'hero-031')

    const [effect] = gs.getEffects(PassiveType.CantBeDestroyed, 'p1')
    expect(effect).toMatchObject({ ownerId: 'p1', sourceCardId: 'hero-031' })
    expect(effect.cardId).toBeUndefined()
    expect(effect.expiry?.map((e) => e.on)).toEqual([GameEventType.TurnStarted])
  })
})
