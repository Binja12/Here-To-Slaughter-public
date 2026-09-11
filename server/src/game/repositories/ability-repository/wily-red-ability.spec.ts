import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import {
  AbilityContext,
  CTX_CHOSEN_CARD,
  CTX_CHOSEN_PLAYER,
  CTX_PULLED_CARD_IDS,
} from '../../abilities/ability-context'
import { WilyRedAbility } from './wily-red-ability'

const makeGs = (deck: string[] = []) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(
    main,
    new CardPile('discard', 'discard'),
    new CardStack('mdeck', 'monster-deck'),
    new CardPile('mpile', 'monster-pile'),
  )
}

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const collect = () => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted }
}

const openWindow = (gs: GameState) =>
  [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

// Wily Red (hero-015): "Draw until you are holding seven cards."

describe('Wily Red (hero-015)', () => {
  it('draws up to seven in hand, one CardDrawn each', () => {
    const gs = makeGs(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'])
    seat(gs, 'p1', ['h1', 'h2', 'h3'])
    const { em, emitted } = collect()

    WilyRedAbility[0].steps[0].execute(gs, new AbilityContext('hero-015', 'p1'), em, new ReactionManager(gs, em))

    expect(gs.getPlayer('p1')!.getHand()).toEqual(['h1', 'h2', 'h3', 'd1', 'd2', 'd3', 'd4'])
    expect(emitted.filter((e) => e.getType() === GameEventType.CardDrawn)).toHaveLength(4)
  })

  it('draws nothing for a hand already at seven or more', () => {
    const gs = makeGs(['d1'])
    seat(gs, 'p1', ['1', '2', '3', '4', '5', '6', '7', '8'])
    const { em, emitted } = collect()

    WilyRedAbility[0].steps[0].execute(gs, new AbilityContext('hero-015', 'p1'), em, new ReactionManager(gs, em))

    expect(gs.getPlayer('p1')!.getHand()).toHaveLength(8)
    expect(emitted).toEqual([])
  })
})
