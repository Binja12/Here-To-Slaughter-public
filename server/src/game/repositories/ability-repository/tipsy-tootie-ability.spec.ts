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
import { TipsyTootieAbility } from './tipsy-tootie-ability'

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

// Tipsy Tootie (hero-045): "Pick an opponent. Steal a hero from their party,
// and this card moves into their party in exchange."

describe('Tipsy Tootie (hero-045)', () => {
  it('steals the chosen hero, then moves ITSELF into the party it stole from', () => {
    const gs = makeGs()
    seat(gs, 'p1', [], ['hero-045'])
    seat(gs, 'p2', [], ['theirs'])
    gs.registerCard(hero('hero-045'))
    gs.registerCard(hero('theirs'))
    const ctx = new AbilityContext('hero-045', 'p1')
    ctx.set(CTX_CHOSEN_PLAYER, ['p2'])
    ctx.set(CTX_CHOSEN_CARD, ['theirs'])
    const { em } = collect()
    const rm = new ReactionManager(gs, em)

    const [, steal, give] = TipsyTootieAbility[1].steps
    steal.execute(gs, ctx, em, rm)
    give.execute(gs, ctx, em, rm)

    expect(gs.getParty('p1').getHeroIds()).toEqual(['theirs'])
    expect(gs.getParty('p2').getHeroIds()).toEqual(['hero-045'])
  })
})
