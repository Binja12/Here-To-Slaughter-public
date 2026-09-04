import { CardType, GameEventType, HeroClass, IGameEvent, ReactionWindowType } from 'shared'
import { GameState } from '../../pipelines/game-state'
import { ReactionManager } from '../../pipelines/reaction-manager'
import { CardStack } from '../../state-structures/card-stack'
import { CardPile } from '../../state-structures/card-pile'
import { Player } from '../../state-structures/player'
import { Party } from '../../state-structures/party'
import { HeroCard } from '../../cards/hero-card'
import { ItemCard } from '../../cards/item-card'
import { GameEventEmitter } from '../../events/game-event-emitter'
import { AbilityContext, CTX_CHOSEN_CARD, CTX_CHOSEN_PLAYER } from '../../abilities/ability-context'
import { IReactionWindow } from '../../interfaces'

const makeGs = (deck: string[] = []) => {
  const main = new CardStack('deck', 'main')
  for (const id of deck) main.addToBottom(id)
  return new GameState(main, new CardPile('discard', 'discard'), new CardStack('mdeck', 'monster-deck'), new CardPile('mpile', 'monster-pile'))
}

const seat = (gs: GameState, id: string, hand: string[] = [], heroIds: string[] = []) => {
  gs.registerPlayer(new Player({ id, name: id, hand, partyId: `${id}-party`, actionPoints: 3 }))
  gs.registerParty(new Party({ playerId: id, leaderId: `${id}-leader`, heroIds, monsterIds: [] }))
}

const hero = (id: string, heroClass = HeroClass.Thief) =>
  new HeroCard({ id, name: id, type: CardType.Hero, image: '', description: '', set: 'base', heroClass, rollReq: 5 })

const item = (id: string, cursed = false) =>
  new ItemCard({ id, name: id, type: CardType.Item, image: '', description: '', set: 'base', cursed })

const openWindow = (gs: GameState): IReactionWindow =>
  [...gs.getFrames().values()].flatMap((f) => f.windows).find((w) => w.isOpen())!

/** Answers the open window the way the player would, in the slot it names. */
const answer = (gs: GameState, ctx: AbilityContext, pick?: string) => {
  const window = openWindow(gs)
  ctx.set(window.resultKey() as string, pick === undefined ? [] : [pick])
  window.resolve()
  return window
}

const wire = (gs: GameState) => {
  const em = new GameEventEmitter()
  const emitted: IGameEvent[] = []
  em.addListener({ onEvent: (e) => emitted.push(e) })
  return { em, emitted, rm: new ReactionManager(gs, em) }
}
import { CrownedSerpentAbility } from './crowned-serpent-ability'
import { CONFIRM } from '../../reactions/task-choice-window'
import { TriggerScope } from 'shared'

// Crowned Serpent (monster-125): "Each time any player (including you) plays
// a Modifier card, you may DRAW a card."

describe('Crowned Serpent (monster-125)', () => {
  it('listens to anyone\'s modifier and asks its owner', () => {
    expect(CrownedSerpentAbility[0].trigger).toEqual({ on: GameEventType.ModifierPlayed, scope: TriggerScope.Anyone })
    const gs = makeGs()
    seat(gs, 'p1', [])
    seat(gs, 'p2', [])
    const ctx = new AbilityContext('monster-125', 'p1')
    const { em, emitted, rm } = wire(gs)
    CrownedSerpentAbility[0].steps[0].execute(gs, ctx, em, rm)
    const window = openWindow(gs)
    expect(window.getType()).toBe(ReactionWindowType.TaskChoice)
    expect(window.getRespondentId()).toBe('p1')
    window.submitReaction('p1', { choice: CONFIRM })
    const confirmed = emitted.find((e) => e.getType() === GameEventType.TaskConfirmed)!
    expect((confirmed.getPayload() as { label: string }).label).toBe(CrownedSerpentAbility[1].trigger.when)
  })

  it('the yes draws one for the owner', () => {
    const gs = makeGs(['top', 'next'])
    seat(gs, 'p1', [])
    const ctx = new AbilityContext('monster-125', 'p1')
    const { em, rm } = wire(gs)
    CrownedSerpentAbility[1].steps[0].execute(gs, ctx, em, rm)
    expect(gs.getPlayer('p1')!.getHand()).toEqual(['top'])
  })
})
