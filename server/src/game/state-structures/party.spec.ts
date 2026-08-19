import { Party } from './party'
import { GameEventEmitter } from '../events/game-event-emitter'
import { GameEventType, HeroClass, IGameEvent } from 'shared'

/** Party membership changes announce themselves; these tests ignore the events. */
const silentEm = new GameEventEmitter()

const mockPartyData = {
  playerId: 'player-1',
  leaderId: 'leader-1',
  heroIds: [],
  monsterIds: [],
}

describe('Party', () => {
  it('should return player id', () => {
    const party = new Party(mockPartyData)
    expect(party.getPlayerId()).toBe('player-1')
  })

  it('should return leader id', () => {
    const party = new Party(mockPartyData)
    expect(party.getLeaderId()).toBe('leader-1')
  })

  it('should add a hero', () => {
    const party = new Party(mockPartyData)
    party.addHero('hero-1', silentEm, 'Played')
    expect(party.getHeroIds()).toContain('hero-1')
  })

  it('should remove a hero', () => {
    const party = new Party(mockPartyData)
    party.addHero('hero-1', silentEm, 'Played')
    party.removeHero('hero-1', silentEm, 'Destroyed')
    expect(party.getHeroIds()).not.toContain('hero-1')
  })

  it('should count slain monsters', () => {
    const party = new Party(mockPartyData)
    party.addMonster('monster-1')
    party.addMonster('monster-2')
    expect(party.getMonsterCount()).toBe(2)
  })

  // -------------------------------------------------------------------------
  // Membership announces itself
  //
  // The emitter is a required parameter, so these events cannot be skipped —
  // ongoing effect expiries key off them, and a silent mutation would leave an
  // effect believing something that is no longer true.
  // -------------------------------------------------------------------------

  const collect = () => {
    const em = new GameEventEmitter()
    const events: IGameEvent[] = []
    em.addListener({ onEvent: (e) => events.push(e) })
    return { em, events }
  }

  it('announces a hero entering, with the reason it arrived', () => {
    const party = new Party({ ...mockPartyData, heroIds: [] })
    const { em, events } = collect()

    party.addHero('hero-1', em, 'Stolen')

    expect(party.getHeroIds()).toContain('hero-1')
    expect(events).toHaveLength(1)
    expect(events[0].getType()).toBe(GameEventType.HeroAddedToParty)
    expect(events[0].getPayload()).toMatchObject({
      cardId: 'hero-1',
      playerId: 'player-1',
      reason: 'Stolen',
    })
  })

  it('announces a hero leaving, with the reason it went', () => {
    const party = new Party({ ...mockPartyData, heroIds: ['hero-1'] })
    const { em, events } = collect()

    party.removeHero('hero-1', em, 'Destroyed')

    expect(party.getHeroIds()).not.toContain('hero-1')
    expect(events).toHaveLength(1)
    expect(events[0].getType()).toBe(GameEventType.HeroRemovedFromParty)
    expect(events[0].getPayload()).toMatchObject({
      cardId: 'hero-1',
      playerId: 'player-1',
      reason: 'Destroyed',
    })
  })
})

// ---------------------------------------------------------------------------
// Equipment — party state rather than card state, so a frame snapshot covers
// it. GameState.clone() shares the card map, and gear has to roll back with a
// lost challenge.
// ---------------------------------------------------------------------------

describe('Party — equipment', () => {
  const withHero = () => {
    const party = new Party({ ...mockPartyData, heroIds: [] })
    party.addHero('hero-1', silentEm, 'Played')
    return party
  }

  it('records what a hero carries', () => {
    const party = withHero()

    party.equipItem('hero-1', 'item-1')

    expect(party.getEquippedItem('hero-1')).toBe('item-1')
  })

  it('reports nothing for a hero carrying nothing', () => {
    expect(withHero().getEquippedItem('hero-1')).toBeUndefined()
  })

  it('hands the gear back when the hero leaves, so the caller must place it', () => {
    const party = withHero()
    party.equipItem('hero-1', 'item-1')

    const carried = party.removeHero('hero-1', silentEm, 'Stolen')

    expect(carried).toBe('item-1')
    expect(party.getEquippedItem('hero-1')).toBeUndefined()
  })

  it('returns nothing for a hero who was carrying nothing', () => {
    const party = withHero()

    expect(party.removeHero('hero-1', silentEm, 'Destroyed')).toBeUndefined()
  })

  it('takes carried gear on arrival', () => {
    const party = new Party({ ...mockPartyData, heroIds: [] })

    party.addHero('hero-1', silentEm, 'Stolen', 'item-1')

    expect(party.getEquippedItem('hero-1')).toBe('item-1')
  })

  it('hands the gear back when it is taken off a hero who stays', () => {
    const party = withHero()
    party.equipItem('hero-1', 'item-1')

    expect(party.unequipItem('hero-1')).toBe('item-1')
    expect(party.getEquippedItem('hero-1')).toBeUndefined()
    expect(party.getHeroIds()).toContain('hero-1')
  })

  it('unequipping a bare hero returns nothing and changes nothing', () => {
    const party = withHero()

    expect(party.unequipItem('hero-1')).toBeUndefined()
    expect(party.getHeroIds()).toContain('hero-1')
  })

  it('clone copies the equipment, so a snapshot can roll it back', () => {
    const party = withHero()
    party.equipItem('hero-1', 'item-1')

    const snapshot = party.clone()
    party.equipItem('hero-1', 'item-2')

    expect(snapshot.getEquippedItem('hero-1')).toBe('item-1')
    expect(party.getEquippedItem('hero-1')).toBe('item-2')
  })
})
