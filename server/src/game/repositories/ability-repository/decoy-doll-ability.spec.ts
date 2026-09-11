import { GameEventType, PassiveType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { AbilityContext } from '../../abilities/ability-context'
import { GameEventEmitter } from '../../events/game-event-emitter'
import type { ReactionManager } from '../../pipelines/reaction-manager'
import { DecoyDollAbility } from './decoy-doll-ability'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { CardType, HeroClass } from 'shared'

const makeGs = () =>
  new GameState(
    new CardStack('deck', 'main'),
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )

const stubRm = {} as ReactionManager

// Decoy Doll (item-066): "If the wearer would be sacrificed or destroyed,
// discard this item instead." What the effect DOES is the destroy and
// sacrifice steps' business (hero-tasks.spec.ts); this checks the declaration.

describe('Decoy Doll (item-066)', () => {
  it('fires when equipped and installs TakesTheHit scoped to its carrier, until unequipped', () => {
    expect(DecoyDollAbility[0].trigger.on).toBe(GameEventType.ItemEquippedToHero)
    const gs = makeGs()
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: ['h'], monsterIds: [] }))
    gs.registerCard(new HeroCard({ id: 'h', name: 'h', type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Bard, rollReq: 5 }))
    gs.registerCard(new ItemCard({ id: 'item-066', name: 'Decoy Doll', type: CardType.Item, image: '', description: '', set: 'base', cursed: false }))
    gs.equipItem('h', 'item-066')

    for (const step of DecoyDollAbility[0].steps) {
      step.execute(gs, new AbilityContext('item-066', 'p1'), new GameEventEmitter(), stubRm)
    }

    const [effect] = gs.getEffects(PassiveType.TakesTheHit, 'p1', 'h')
    expect(effect).toMatchObject({ ownerId: 'p1', sourceCardId: 'item-066', cardId: 'h' })
    expect(effect.expiry?.map((e) => e.on)).toEqual([GameEventType.ItemUnequipped])
  })
})
