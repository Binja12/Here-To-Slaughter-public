import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType, Zone } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'

const makeGs = (deck: string[] = []) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(main, new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
}
const seat = (gs: GameState, id: string, hand: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds: [], monsterIds: [] }))
}
const hero = (id: string) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass: HeroClass.Ranger, rollReq: 5 })
const collect = () => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted }
}
const openWindow = (gs: GameState) => [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!
import { SharpFoxAbility } from './sharp-fox-ability'

// Sharp Fox (hero-016): "Look at another player's hand."

describe('Sharp Fox (hero-016)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("shows the chosen player's hand to the owner, no window, and it goes away by itself", () => {
    const gs = makeGs()
    seat(gs, 'p1')
    seat(gs, 'p2', ['x', 'y'])
    const ctx = new AbilityContext('hero-016', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    const { em, emitted } = collect()

    SharpFoxAbility[0].steps[1].execute(gs, ctx, em, new ReactionManager(gs, em))

    expect(gs.getRevealed('p1')).toEqual(['x', 'y'])
    expect(gs.getFrames().size).toBe(0)
    expect(emitted.map((e) => e.getType())).toEqual([GameEventType.CardsRevealed])
    jest.runOnlyPendingTimers()
    expect(gs.getRevealed('p1')).toEqual([])
  })
})
