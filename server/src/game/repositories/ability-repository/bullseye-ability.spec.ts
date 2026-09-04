import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_DRAWN_CARD_IDS } from '../../abilities/ability-context'
import { BullseyeAbility } from './bullseye-ability'

// Bullseye (hero-014): "Look at the top 3 cards of the deck. Add one to your
// hand, then return the other two to the top of the deck in any order."

const makeGs = (deck: string[]) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(main, new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
}

describe('Bullseye (hero-014)', () => {
  it('offers the top three where they lie, draws the chosen one, and the other two stay on top in order', () => {
    const gs = makeGs(['t1', 't2', 't3', 't4'])
    gs.registerPlayer(new Player({ id: 'p1', name: 'p1', hand: [], partyId: 'p1-party', actionPoints: 3 }))
    gs.registerParty(new Party({ playerId: 'p1', leaderId: 'p1-leader', heroIds: [], monsterIds: [] }))
    for (const id of ['t1', 't2', 't3', 't4']) {
      gs.registerCard(new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Ranger, rollReq: 5 }))
    }
    const ctx = new AbilityContext('hero-014', 'p1')
    const em = new GameEventEmitter()
    const emitted: IGameEvent[] = []
    em.addListener({ onEvent: (e) => emitted.push(e) })
    const rm = new ReactionManager(gs, em)
    const [look, draw] = BullseyeAbility[0].steps

    look.execute(gs, ctx, em, rm)
    const window = [...gs.frames.values()].flatMap((f) => f.windows).find((w) => w.isOpen())!
    expect(window.getType()).toBe(ReactionWindowType.CardChoice)
    expect(window.getOptions()).toEqual(['t1', 't2', 't3']) // the look
    expect(gs.getMainDeck().getSize()).toBe(4) // nothing moved
    ctx.set(CTX_CHOSEN_CARD, ['t2'])
    window.resolve()

    draw.execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['t2'])
    expect(ctx.get(CTX_DRAWN_CARD_IDS)).toEqual(['t2'])
    expect(gs.peekMainDeck(3)).toEqual(['t1', 't3', 't4']) // the queue closed over the gap
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDrawn)).toHaveLength(1)
  })
})
