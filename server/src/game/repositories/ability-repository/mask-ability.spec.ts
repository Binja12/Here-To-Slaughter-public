import { CardType, HeroClass } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { MaskAbility } from './mask-ability'
import { abilityRegistry } from './index'
import { baseGameCards } from '../../../data/base-game-cards'

// The six class masks (item-067 … item-072): "The wearer counts as a <class>,
// whatever its printed class." No rules: the class is
// data, and the board derives it (GameState.getHeroClass, game-state.spec.ts).

describe('the class masks (item-067 … item-072)', () => {
  it('declare no rules — the class comes from the card data', () => {
    expect(MaskAbility).toEqual([])
    for (const id of ['item-067', 'item-068', 'item-069', 'item-070', 'item-071', 'item-072']) {
      expect(abilityRegistry.get(id)).toBe(MaskAbility)
    }
  })

  it('each mask names its class in the printed data', () => {
    const classes = ['item-067', 'item-068', 'item-069', 'item-070', 'item-071', 'item-072'].map(
      (id) => (baseGameCards.find((c) => c.id === id) as { heroClass?: HeroClass }).heroClass,
    )
    expect(classes).toEqual([
      HeroClass.Fighter, HeroClass.Ranger, HeroClass.Thief, HeroClass.Guardian, HeroClass.Wizard, HeroClass.Bard,
    ])
  })

  it('a worn mask is the class the board reads; off, the default is back', () => {
    const gs = new GameState(
      new CardStack('deck', 'main'),
      new CardPile('discard', 'discard'),
      new CardStack('mdeck', 'monster-deck'),
      new CardPile('mpile', 'monster-pile'),
    )
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: ['h'], monsterIds: [] }))
    gs.registerCard(new HeroCard({ id: 'h', name: 'h', type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Wizard, rollReq: 5 }))
    gs.registerCard(new ItemCard({ id: 'item-072', name: 'Bard Mask', type: CardType.Item, image: '', description: '', set: 'base', cursed: false, heroClass: HeroClass.Bard }))

    gs.getParty('p1').equipItem('h', 'item-072')
    expect(gs.getHeroClass('h')).toBe(HeroClass.Bard)
    gs.getParty('p1').unequipItem('h')
    expect(gs.getHeroClass('h')).toBe(HeroClass.Wizard)
  })
})
