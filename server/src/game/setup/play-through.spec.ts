import {
  CardType,
  GameEventType,
  MonsterCardData,
  ReactionWindowType,
} from 'shared'
import { baseGameCards } from '../../data/base-game-cards'
import { CONFIRM } from '../reactions/task-choice-window'
import { PlayChallengeReaction } from '../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../reactions/play-modifier-reaction'
import {
  SEATS,
  actionId,
  printed,
  table,
  stacked,
  see,
  board,
  COUNTDOWN_MS,
  active,
  seatOf,
  partyOf,
  heldOfType,
  inDiscard,
  ofType,
  payloads,
  react,
  answer,
  draw,
  playHero,
  playMagic,
  playItem,
  rollOnHero,
  rollOnLeader,
  attack,
  pass,
  redraw,
  until,
  settle,
  windowFor,
  endTurn,
  nextTurnOf,
  HIGHEST,
  LOWEST,
  MIDDLING,
  fixDice,
  scriptDice,
} from './play-through-helpers'

describe('a game played through', () => {
  afterEach(() => jest.restoreAllMocks())

  // --- The opening --------------------------------------------------------

  it('opens on the first seat with a full budget and a dealt hand', () => {
    const t = table()
    const view = see(t, t.game.playerOrder[0])

    expect(view.currentPlayerId).toBe(t.game.playerOrder[0])
    expect(seatOf(view, view.playerId).actionPoints).toBe(3)
    expect(view.hand).toHaveLength(5)
    expect(view.pendingWindows).toEqual([])
    expect(view.busy).toBe(false)
  })

  it('deals every seat a hand, a leader and an empty party', () => {
    const t = table()

    for (const playerId of SEATS) {
      const view = see(t, playerId)
      expect(view.hand).toHaveLength(5)
      expect(partyOf(view, playerId).leader.type).toBe(CardType.Leader)
      expect(partyOf(view, playerId).heroes).toEqual([])
      expect(seatOf(view, playerId).handCount).toBe(5)
    }
    // Six leaders, three seats, and no two parties led by the same card.
    const leaders = SEATS.map((id) => partyOf(board(t), id).leader.id)
    expect(new Set(leaders).size).toBe(SEATS.length)
  })

  // --- Turn rotation ------------------------------------------------------

  it('rotates through every seat and back to the first', async () => {
    const t = table()
    const seen: string[] = []

    for (let i = 0; i < SEATS.length + 1; i++) {
      seen.push(active(t))
      await endTurn(t)
    }

    expect(seen).toEqual([...t.game.playerOrder, t.game.playerOrder[0]])
  })

  it('resets the budget every turn', async () => {
    const t = table()

    await endTurn(t)

    expect(seatOf(board(t), active(t)).actionPoints).toBe(3)
  })

  it('leaves nothing open between turns', async () => {
    const t = table()

    for (let i = 0; i < 4; i++) await endTurn(t)

    const view = board(t)
    expect(view.pendingWindows).toEqual([])
    expect(view.busy).toBe(false)
  })

  // --- Passing ------------------------------------------------------------

  it('passes with a full budget, and the next seat is up at once', async () => {
    const t = table()
    const [first, second] = t.game.playerOrder

    pass(t, first)
    await settle(t)

    expect(active(t)).toBe(second)
    expect(seatOf(board(t), second).actionPoints).toBe(3)
    expect(ofType(t, GameEventType.TurnEnded)).toHaveLength(1)
  })

  it('a pass waits for an ability still resolving before the turn ends', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    const offer = await windowFor(t, playerId, ReactionWindowType.TaskChoice)

    // The pass is queued behind the open window, not run past it.
    pass(t, playerId)
    expect(active(t)).toBe(playerId)
    expect(ofType(t, GameEventType.TurnEnded)).toEqual([])

    fixDice(HIGHEST)
    answer(t, offer, CONFIRM)
    await until(() => active(t) !== playerId, 'the turn to end after the roll')

    // The roll happened on this turn — the pass did not cut it off.
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-044')
    expect(board(t).pendingWindows).toEqual([])
  })

  it('refuses a player who acts out of turn, at no cost to them', async () => {
    const t = table()
    const idle = t.game.playerOrder[1]
    const before = see(t, idle)

    draw(t, idle)
    await settle(t)

    const after = see(t, idle)
    expect(after.hand).toHaveLength(before.hand.length)
    expect(seatOf(after, idle).actionPoints).toBe(
      seatOf(before, idle).actionPoints,
    )
  })

  // --- Drawing ------------------------------------------------------------

  it('a draw costs a point, grows the hand and shrinks the deck', async () => {
    const t = table()
    const playerId = active(t)
    const before = see(t, playerId)

    draw(t, playerId)
    await settle(t)

    const after = see(t, playerId)
    expect(after.hand).toHaveLength(before.hand.length + 1)
    expect(after.mainDeck.count).toBe(before.mainDeck.count - 1)
    expect(seatOf(after, playerId).actionPoints).toBe(
      seatOf(before, playerId).actionPoints - 1,
    )
    // The hand grew for its owner and stayed a number for everybody else.
    expect(seatOf(see(t, t.game.playerOrder[1]), playerId).handCount).toBe(
      after.hand.length,
    )
  })

  it('stops at an empty deck instead of drawing past it', async () => {
    // Five cards, four dealt: one draw empties it and the next has nowhere to
    // go.
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004', 'hero-005'],
      slack: 1,
    })
    const playerId = active(t)

    draw(t, playerId)
    await settle(t)
    expect(see(t, playerId).mainDeck.count).toBe(0)

    const afterOne = see(t, playerId)
    draw(t, playerId)
    await settle(t)

    const afterTwo = see(t, playerId)
    expect(afterTwo.mainDeck.count).toBe(0)
    expect(afterTwo.hand).toHaveLength(afterOne.hand.length)
    expect(seatOf(afterTwo, playerId).actionPoints).toBe(
      seatOf(afterOne, playerId).actionPoints,
    )
  })

  it('redraws: every card discarded, then five drawn, and the budget is gone', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)
    const before = see(t, playerId)
    const oldHand = before.hand.map((c) => c.id)

    redraw(t, playerId)
    await settle(t)

    const mine = t.events.filter(
      (e) =>
        e.getPlayerId() === playerId &&
        (e.getType() === GameEventType.CardDiscarded ||
          e.getType() === GameEventType.CardDrawn),
    )
    // N discards, in hand order, then five draws — one event each.
    expect(mine.map((e) => e.getType())).toEqual([
      ...oldHand.map(() => GameEventType.CardDiscarded),
      ...Array(5).fill(GameEventType.CardDrawn),
    ])
    expect(
      mine
        .slice(0, oldHand.length)
        .map((e) => (e.getPayload() as { cardId: string }).cardId),
    ).toEqual(oldHand)

    // The turn ended on it, so read the seat from the board.
    const view = see(t, playerId)
    expect(view.hand).toHaveLength(5)
    for (const id of oldHand) {
      expect(view.hand.map((c) => c.id)).not.toContain(id)
      expect(inDiscard(view, id)).toBe(true)
    }
    expect(view.mainDeck.count).toBe(before.mainDeck.count - 5)
    expect(active(t)).not.toBe(playerId)
  })

  it('shuffles the discard back in the moment the last card is drawn', async () => {
    // Alice holds Critical Boost and a filler; four cards stay in the deck.
    // Critical Boost draws three and discards one, and is discarded itself
    // when its run ends — so the deck is down to one card and the discard
    // holds two.
    const t = stacked({
      deck: ['magic-053', 'hero-001', 'hero-002', 'hero-003'],
      slack: 4,
    })
    const playerId = active(t)

    playMagic(t, playerId, 'magic-053')
    const pick = await windowFor(t, playerId, ReactionWindowType.CardChoice)
    answer(t, pick, 'hero-001')
    await settle(t)

    const before = see(t, playerId)
    expect(before.mainDeck.count).toBe(1)
    expect(before.discardPile.map((c) => c.id).sort()).toEqual([
      'hero-001',
      'magic-053',
    ])

    draw(t, playerId)
    await settle(t)

    // The last card came out, and the discard went in behind it at once.
    const refilled = see(t, playerId)
    expect(refilled.hand).toHaveLength(before.hand.length + 1)
    expect(refilled.discardPile).toEqual([])
    expect(refilled.mainDeck.count).toBe(2)

    draw(t, playerId)
    await settle(t)

    const after = see(t, playerId)
    expect(after.mainDeck.count).toBe(1)
    const drawn = payloads(t, GameEventType.CardDrawn).map((p) => p['cardId'])
    expect(['hero-001', 'magic-053']).toContain(drawn[drawn.length - 1])
  })

  // --- Playing a hero -----------------------------------------------------

  it('plays a hero nobody contests, and it joins the party', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t) // the challenge, then the roll offer behind it

    const view = see(t, playerId)
    expect(partyOf(view, playerId).heroes.map((h) => h.card.id)).toEqual([
      'hero-044',
    ])
    expect(view.hand.map((c) => c.id)).not.toContain('hero-044')
    expect(view.pendingWindows).toEqual([])
    expect(seatOf(view, playerId).actionPoints).toBe(2)
  })

  it('a lost challenge un-plays the hero and discards it', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    // Challenger rolls 11, defender rolls 1 — the play is defeated.
    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(
      t,
      new PlayChallengeReaction(
        actionId(),
        challenger,
        'challenge-102',
        'hero-044',
      ),
    )
    await settle(t)

    const view = see(t, defender)
    expect(partyOf(view, defender).heroes).toEqual([])
    expect(inDiscard(view, 'hero-044')).toBe(true)
    // The challenge card was spent either way — its own frame put it away.
    expect(inDiscard(view, 'challenge-102')).toBe(true)
    expect(see(t, challenger).hand.map((c) => c.id)).not.toContain(
      'challenge-102',
    )

    const resolved = payloads(t, GameEventType.ChallengeResolved)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]['defenderWins']).toBe(false)
    // The point was spent before the snapshot, so the rollback cannot refund it.
    expect(seatOf(view, defender).actionPoints).toBe(2)
  })

  it('a survived challenge leaves the hero standing', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    // Challenger rolls 1, defender rolls 11.
    scriptDice([LOWEST, HIGHEST], HIGHEST)
    react(
      t,
      new PlayChallengeReaction(
        actionId(),
        challenger,
        'challenge-102',
        'hero-044',
      ),
    )
    await settle(t)

    const view = see(t, defender)
    expect(partyOf(view, defender).heroes.map((h) => h.card.id)).toEqual([
      'hero-044',
    ])
    expect(inDiscard(view, 'hero-044')).toBe(false)
    expect(inDiscard(view, 'challenge-102')).toBe(true)
    expect(
      payloads(t, GameEventType.ChallengeResolved)[0]['defenderWins'],
    ).toBe(true)
  })

  it('only one challenge lands on a card, and the second is spent for nothing', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    fixDice(HIGHEST)
    react(
      t,
      new PlayChallengeReaction(
        actionId(),
        challenger,
        'challenge-102',
        'hero-044',
      ),
    )
    react(
      t,
      new PlayChallengeReaction(
        actionId(),
        challenger,
        'challenge-103',
        'hero-044',
      ),
    )
    await settle(t)

    expect(ofType(t, GameEventType.ChallengeStarted)).toHaveLength(1)
    // Both left the hand. A challenge card is spent when it is played, and the
    // window simply refuses to start a second contest.
    const view = see(t, challenger)
    expect(view.hand.map((c) => c.id)).not.toContain('challenge-102')
    expect(view.hand.map((c) => c.id)).not.toContain('challenge-103')
  })

  it('never offers a roll on a hero the challenge took away', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'challenge-102', 'challenge-103'],
    })
    const [defender, challenger] = t.game.playerOrder

    playHero(t, defender, 'hero-044')
    await windowFor(t, defender, ReactionWindowType.Challenge)

    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(
      t,
      new PlayChallengeReaction(
        actionId(),
        challenger,
        'challenge-102',
        'hero-044',
      ),
    )
    await settle(t)

    // The offer is matched from the hero's position in the party, and a
    // defeated hero is not there to be matched (§6).
    expect(
      t.events.filter(
        (e) =>
          e.getType() === GameEventType.ReactionWindowOpened &&
          (e.getPayload() as { windowType?: string }).windowType ===
            ReactionWindowType.TaskChoice,
      ),
    ).toEqual([])
  })

  // --- Answering a confirm ------------------------------------------------

  it('takes up the roll a played hero is offered, for free', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    const offer = await windowFor(t, playerId, ReactionWindowType.TaskChoice)

    // The answer is one of the options the screen was handed, not a value the
    // client invented.
    expect(offer.options).toContain(CONFIRM)
    fixDice(HIGHEST)
    answer(t, offer, CONFIRM)
    await settle(t)

    const rolls = payloads(t, GameEventType.DiceRolled)
    expect(rolls.map((p) => p['cardId'])).toContain('hero-044')
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-044')
    // One point for the play and nothing for the roll: the offer belongs to the
    // hero, and a task has no price (§1).
    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(2)
  })

  it('lets the offer lapse when the player says nothing', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
    expect(partyOf(see(t, playerId), playerId).heroes[0].canRollOn).toBe(true)
  })

  // --- Rolling on a hero --------------------------------------------------

  it('spends the slot on a successful roll, and the screen stops offering it', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(HIGHEST)
    rollOnHero(t, playerId, 'hero-044')
    await settle(t)

    const view = see(t, playerId)
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-044')
    expect(partyOf(view, playerId).heroes[0].canRollOn).toBe(false)
    expect(seatOf(view, playerId).actionPoints).toBe(1)
  })

  it('spends the slot and the point on a failed roll too', async () => {
    // Whiskers asks for 11; a middling roll of 8 comes up short.
    const t = stacked({
      deck: ['hero-037', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-037')
    await settle(t)

    fixDice(MIDDLING)
    rollOnHero(t, playerId, 'hero-037')
    await settle(t)

    const view = see(t, playerId)
    expect(
      payloads(t, GameEventType.RollFailed).map((p) => p['cardId']),
    ).toContain('hero-037')
    // markAbilityUsed runs before the frame opens, so the rollback cannot
    // refund the slot (§1).
    expect(partyOf(view, playerId).heroes[0].canRollOn).toBe(false)
    expect(seatOf(view, playerId).actionPoints).toBe(1)
    expect(partyOf(view, playerId).heroes.map((h) => h.card.id)).toEqual([
      'hero-037',
    ])
  })

  /**
   * Whiskers asks for 11 and rolls 8; modifier-086 is printed `[3, -1]`, so one
   * face saves the roll and the other sinks it. That is what makes the pick
   * observable — an unanswered value choice on your own roll falls to the
   * HIGHEST, so picking 3 alone would pass with no submission at all.
   */
  const failingRoll = () =>
    stacked({ deck: ['hero-037', 'modifier-086', 'hero-001', 'hero-002'] })

  it('turns a failing roll into a passing one with a modifier card', async () => {
    const t = failingRoll()
    const playerId = active(t)

    playHero(t, playerId, 'hero-037')
    await settle(t)

    fixDice(MIDDLING)
    rollOnHero(t, playerId, 'hero-037')
    await windowFor(t, playerId, ReactionWindowType.Modifier)

    // The play names the value off the card's printed face, and the card's own
    // entry lands it (§7).
    react(
      t,
      new PlayModifierReaction(
        actionId(),
        playerId,
        'modifier-086',
        playerId,
        3,
      ),
    )
    await settle(t)

    const view = see(t, playerId)
    const applied = payloads(t, GameEventType.ModifierApplied)
    expect(applied).toHaveLength(1)
    expect(applied[0]['value']).toBe(3)
    expect(applied[0]['finalRoll']).toBe(11)
    expect(
      payloads(t, GameEventType.RollSuccess).map((p) => p['cardId']),
    ).toContain('hero-037')
    expect(ofType(t, GameEventType.RollFailed)).toEqual([])
    // Spent, and put away by the frame it was spent into.
    expect(view.hand.map((c) => c.id)).not.toContain('modifier-086')
    expect(inDiscard(view, 'modifier-086')).toBe(true)
    expect(partyOf(view, playerId).instanceCards).toEqual([])
  })

  it('lands the number the player picked, not the one silence would have', async () => {
    const t = failingRoll()
    const playerId = active(t)

    playHero(t, playerId, 'hero-037')
    await settle(t)

    fixDice(MIDDLING)
    rollOnHero(t, playerId, 'hero-037')
    await windowFor(t, playerId, ReactionWindowType.Modifier)

    react(
      t,
      new PlayModifierReaction(
        actionId(),
        playerId,
        'modifier-086',
        playerId,
        -1,
      ),
    )
    await settle(t)

    expect(payloads(t, GameEventType.ModifierApplied)[0]['value']).toBe(-1)
    expect(
      payloads(t, GameEventType.RollFailed).map((p) => p['cardId']),
    ).toContain('hero-037')
    // Spent all the same: a card is paid for when it is played.
    expect(inDiscard(see(t, playerId), 'modifier-086')).toBe(true)
  })

  it('will not roll on a hero twice in one turn', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(HIGHEST)
    rollOnHero(t, playerId, 'hero-044')
    await settle(t)
    const afterFirst = see(t, playerId)

    rollOnHero(t, playerId, 'hero-044')
    await settle(t)

    expect(ofType(t, GameEventType.DiceRolled)).toHaveLength(1)
    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(
      seatOf(afterFirst, playerId).actionPoints,
    )
  })

  it('gives the slot back at the start of the next turn', async () => {
    const t = stacked({ seats: SEATS, deck: ['hero-044'] })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    fixDice(HIGHEST)
    rollOnHero(t, playerId, 'hero-044')
    await settle(t)
    expect(partyOf(see(t, playerId), playerId).heroes[0].canRollOn).toBe(false)

    await nextTurnOf(t, playerId)

    expect(partyOf(see(t, playerId), playerId).heroes[0].canRollOn).toBe(true)
  })

  // --- The leader ---------------------------------------------------------

  it('activates a leader without dice and without a window', async () => {
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
    })
    const playerId = active(t)
    const leaderId = partyOf(see(t, playerId), playerId).leader.id

    rollOnLeader(t, playerId, leaderId)
    await settle(t)

    const view = see(t, playerId)
    expect(seatOf(view, playerId).actionPoints).toBe(2)
    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
    expect(partyOf(view, playerId).canRollOnLeader).toBe(false)
  })

  it('activates a leader once a turn', async () => {
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
    })
    const playerId = active(t)
    const leaderId = partyOf(see(t, playerId), playerId).leader.id

    rollOnLeader(t, playerId, leaderId)
    await settle(t)
    rollOnLeader(t, playerId, leaderId)
    await settle(t)

    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(2)
  })

  // --- Items --------------------------------------------------------------

  it('equips an item onto a hero already in the party', async () => {
    const t = stacked({
      deck: ['hero-044', 'item-067', 'hero-001', 'hero-002'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    playItem(t, playerId, 'item-067', 'hero-044')
    await settle(t)

    const view = see(t, playerId)
    expect(partyOf(view, playerId).heroes[0].equippedItem?.id).toBe('item-067')
    expect(view.hand.map((c) => c.id)).not.toContain('item-067')
    expect(seatOf(view, playerId).actionPoints).toBe(1)
  })

  it('refuses a second item on the same hero', async () => {
    const t = stacked({
      deck: ['hero-044', 'item-067', 'item-068'],
      handSize: 3,
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    playItem(t, playerId, 'item-067', 'hero-044')
    await settle(t)
    playItem(t, playerId, 'item-068', 'hero-044')
    await settle(t)

    const view = see(t, playerId)
    expect(partyOf(view, playerId).heroes[0].equippedItem?.id).toBe('item-067')
    expect(view.hand.map((c) => c.id)).toContain('item-068')
    expect(seatOf(view, playerId).actionPoints).toBe(1)
  })

  // --- Magic --------------------------------------------------------------

  it('runs a magic card and leaves it in the discard, not on the table', async () => {
    // Critical Boost: DRAW 3 and DISCARD a card.
    const t = stacked({
      deck: [
        'magic-053',
        'hero-001',
        'hero-002',
        'hero-003',
        'hero-004',
        'hero-005',
        'hero-006',
      ],
    })
    const playerId = active(t)

    playMagic(t, playerId, 'magic-053')
    const pick = await windowFor(t, playerId, ReactionWindowType.CardChoice)

    // Three drawn, and the whole hand offered to pay with.
    expect(pick.options).toContain('hero-004')
    expect(pick.options).toContain('hero-001')
    answer(t, pick, 'hero-001')
    await settle(t)

    const view = see(t, playerId)
    expect(view.hand.map((c) => c.id)).toEqual(
      expect.arrayContaining(['hero-004', 'hero-005', 'hero-006']),
    )
    expect(view.hand.map((c) => c.id)).not.toContain('hero-001')
    expect(inDiscard(view, 'hero-001')).toBe(true)
    // The zone is not a waiting room: the card leaves when its run ends (§1).
    expect(inDiscard(view, 'magic-053')).toBe(true)
    expect(partyOf(view, playerId).instanceCards).toEqual([])
  })

  it('rolls a defeated magic card back before its ability can run', async () => {
    const t = stacked({
      deck: [
        'magic-053',
        'hero-001',
        'challenge-102',
        'hero-002',
        'hero-003',
        'hero-004',
        'hero-005',
      ],
    })
    const [caster, challenger] = t.game.playerOrder
    const handBefore = see(t, caster).hand.length

    playMagic(t, caster, 'magic-053')
    await windowFor(t, caster, ReactionWindowType.Challenge)

    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(
      t,
      new PlayChallengeReaction(
        actionId(),
        challenger,
        'challenge-102',
        'magic-053',
      ),
    )
    await settle(t)

    const view = see(t, caster)
    // Its steps trigger on the SETTLED frame, and a defeated card is not among
    // the sources when that event goes out — so nothing was drawn (§1).
    expect(view.hand).toHaveLength(handBefore - 1)
    expect(inDiscard(view, 'magic-053')).toBe(true)
    expect(partyOf(view, caster).instanceCards).toEqual([])
  })

  // --- Monsters -----------------------------------------------------------

  it('offers no monster to a party with no heroes — the leader answers nothing', async () => {
    // Nobody has played a hero. The party LEADER is a card of a class, but a
    // monster asks for HEROES: Arctic Aries wants one of any class and gets
    // none, Orthus wants a Wizard and one more, Mega Slime four. The bare
    // leader answers none of them (the owner, 2026-09-04).
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
      monsters: ['monster-128', 'monster-131', 'monster-123'],
    })
    const playerId = active(t)

    expect(see(t, playerId).attackableMonsterIds).toEqual([])

    // Not merely unoffered: the attack itself is refused, so the points stay
    // in the player's hand and no die is thrown.
    attack(t, playerId, 'monster-128')
    attack(t, playerId, 'monster-131')
    await settle(t)

    expect(seatOf(see(t, playerId), playerId).actionPoints).toBe(3)
    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
  })

  // --- The class win --------------------------------------------------

  it('ends the game the moment the last class survives its challenge — the roll it is offered never holds it up', async () => {
    // Alice leads with the Shadow Claw, a Thief; Bad Axe is a Fighter. Two
    // classes on a table that asks for two: the win lands when the challenge
    // settles, NOT when the roll offer that follows it is answered.
    const t = stacked({
      deck: ['hero-001', 'hero-002', 'hero-003', 'hero-004'],
      classesWin: 2,
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-001')
    await windowFor(t, playerId, ReactionWindowType.Challenge)
    // Within the challenge's own countdown and a half: waiting for the offer
    // to lapse as well would take two of them.
    await until(
      () => board(t).winnerId === playerId,
      'the game to end when the challenge settles',
      COUNTDOWN_MS * 1.5,
    )

    expect(board(t).phase).toBe('Concluded')
    expect(board(t).pendingWindows).toEqual([])
    expect(board(t).busy).toBe(false)
    expect(ofType(t, GameEventType.DiceRolled)).toEqual([])
  })

  it('ends the game on the slay itself, before the attack\u2019s frame settles or anything continues from it', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
      winAt: 1,
    })
    const playerId = active(t)
    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(HIGHEST)
    attack(t, playerId, 'monster-128')
    await until(() => board(t).winnerId === playerId, 'the slay to end the game')

    // MonsterSlain moved the board and the win was asked there, inside the
    // attack's own settle: the attack's FrameResolved came AFTER the end.
    // (The recorder hears GameEnded before MonsterSlain itself — it is
    // emitted from inside that dispatch, and the recorder listens last.)
    const types = t.events.map((e) => e.getType())
    expect(types).toContain(GameEventType.MonsterSlain)
    expect(types.indexOf(GameEventType.GameEnded)).toBeLessThan(
      types.lastIndexOf(GameEventType.FrameResolved),
    )
    expect(board(t).busy).toBe(false)
    expect(board(t).pendingWindows).toEqual([])
  })

  it('offers a monster the moment the party fields every hero it asks for', async () => {
    const t = stacked({
      deck: ['hero-037', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-131'],
    })
    const playerId = active(t)

    // Orthus asks for a Wizard and one more hero of any class. The leader is
    // not one of them, so the party needs two heroes of its own.
    expect(see(t, playerId).attackableMonsterIds).not.toContain('monster-131')

    playHero(t, playerId, 'hero-037') // Whiskers, a Wizard — the named half
    await settle(t)
    expect(see(t, playerId).attackableMonsterIds).not.toContain('monster-131')

    const second = see(t, playerId).hand.find((card) => card.type === CardType.Hero)!
    playHero(t, playerId, second.id) // … and any second hero answers 'Any'
    await settle(t)

    expect(see(t, playerId).attackableMonsterIds).toContain('monster-131')
  })

  it('slays a monster, takes it into the party, and the row refills', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    const deckBefore = see(t, playerId).monsterDeck.count

    fixDice(HIGHEST) // 12, against a requirement of 10
    attack(t, playerId, 'monster-128')
    await settle(t)

    const view = see(t, playerId)
    expect(partyOf(view, playerId).monsters.map((m) => m.id)).toEqual([
      'monster-128',
    ])
    expect(view.monsterRow.map((m) => m.id)).not.toContain('monster-128')
    // The row is what a player attacks FROM, so it is refilled behind them.
    expect(view.monsterRow).toHaveLength(3)
    expect(view.monsterDeck.count).toBe(deckBefore - 1)
    expect(seatOf(view, playerId).actionPoints).toBe(0)
  })

  it('leaves a monster that fought back exactly where it was', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(LOWEST) // 2, inside Arctic Aries' fight-back band of 6 and under
    attack(t, playerId, 'monster-128')
    await settle(t)

    const view = see(t, playerId)
    expect(ofType(t, GameEventType.MonsterFoughtBack)).toHaveLength(1)
    expect(ofType(t, GameEventType.MonsterSlain)).toEqual([])
    expect(view.monsterRow.map((m) => m.id)).toContain('monster-128')
    expect(partyOf(view, playerId).monsters).toEqual([])
    // Priced in action points, and Arctic Aries' printed fight-back then
    // sacrifices the attacker's only hero.
    expect(seatOf(view, playerId).actionPoints).toBe(0)
    expect(partyOf(view, playerId).heroes).toEqual([])
    expect(inDiscard(view, 'hero-044')).toBe(true)
  })

  it('says nothing at all about a miss', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)

    fixDice(MIDDLING) // 8: over the fight-back band, under the requirement
    attack(t, playerId, 'monster-128')
    await settle(t)

    const view = see(t, playerId)
    expect(ofType(t, GameEventType.MonsterSlain)).toEqual([])
    expect(ofType(t, GameEventType.MonsterFoughtBack)).toEqual([])
    expect(view.monsterRow.map((m) => m.id)).toContain('monster-128')
    expect(view.monsterRow).toHaveLength(3)
  })

  it('reads the printed bands off the card it is attacking', () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const monster = see(t, active(t)).monsterRow.find(
      (m) => m.id === 'monster-128',
    ) as MonsterCardData

    // The numbers the three tests above are written against, on the wire.
    expect(monster.higherReq).toBe(10)
    expect(monster.lowerReq).toBe(6)
  })

  // --- Winning ------------------------------------------------------------

  it('ends the game when a win condition is met', async () => {
    // One slain monster wins at this table.
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
      winAt: 1,
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    fixDice(HIGHEST)
    attack(t, playerId, 'monster-128')
    await settle(t)

    // Play (1) plus attack (2) is the whole budget, so the turn ends by
    // itself — and the win is checked as the turn ends, not as it is won.
    const ended = payloads(t, GameEventType.GameEnded)
    expect(ended).toHaveLength(1)
    expect(ended[0]['winnerId']).toBe(playerId)
  })

  it('plays on while nobody has met one', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
      monsters: ['monster-128'],
    })
    const playerId = active(t)

    playHero(t, playerId, 'hero-044')
    await settle(t)
    fixDice(HIGHEST)
    attack(t, playerId, 'monster-128')
    await settle(t)

    expect(ofType(t, GameEventType.GameEnded)).toEqual([])
    expect(partyOf(see(t, playerId), playerId).monsters).toHaveLength(1)
  })

  // --- Nothing gets stuck -------------------------------------------------

  it('survives a long run of turns with no window or pipeline left behind', async () => {
    const t = table()

    for (let turn = 0; turn < 9; turn++) {
      const playerId = active(t)
      const view = see(t, playerId)

      const heroId = heldOfType(view, CardType.Hero)
      if (heroId && seatOf(view, playerId).actionPoints > 0) {
        playHero(t, playerId, heroId)
        await settle(t)
      }

      const rollable = partyOf(see(t, playerId), playerId).heroes.find(
        (h) => h.canRollOn,
      )
      if (rollable && seatOf(see(t, playerId), playerId).actionPoints > 0) {
        rollOnHero(t, playerId, rollable.card.id)
        await settle(t)
      }

      const attackable = see(t, playerId).attackableMonsterIds[0]
      if (attackable && seatOf(see(t, playerId), playerId).actionPoints >= 2) {
        attack(t, playerId, attackable)
        await settle(t)
      }

      if (ofType(t, GameEventType.GameEnded).length > 0) break

      await endTurn(t)

      const between = board(t)
      expect(between.pendingWindows).toEqual([])
      expect(between.busy).toBe(false)
    }

    expect(board(t).currentPlayerId).toBeDefined()
  }, 60000)

  it('finishes its turns even when nobody answers anything', async () => {
    const t = stacked({
      deck: ['hero-044', 'hero-001', 'hero-002', 'hero-003'],
    })
    const playerId = active(t)

    // Play, then walk away: the challenge lapses, the roll offer lapses, and
    // the turn still rolls over. A timeout resolves; it never rolls back (§4).
    playHero(t, playerId, 'hero-044')
    await endTurn(t)

    expect(active(t)).not.toBe(playerId)
    expect(board(t).pendingWindows).toEqual([])
    expect(partyOf(board(t), playerId).heroes).toHaveLength(1)
  })

  // --- Isolation between simultaneous games -------------------------------

  it('two games run side by side without touching each other', async () => {
    const one = table()
    const two = table()

    await endTurn(one)

    expect(active(one)).toBe(one.game.playerOrder[1])
    expect(active(two)).toBe(two.game.playerOrder[0])
    expect(seatOf(board(two), active(two)).actionPoints).toBe(3)
    expect(board(two).mainDeck.count).toBe(
      baseGameCards.filter((c) =>
        [
          CardType.Hero,
          CardType.Item,
          CardType.Magic,
          CardType.Modifier,
          CardType.Challenge,
        ].includes(c.type),
      ).length -
        SEATS.length * 5,
    )
  })

  it('keeps two games’ card objects apart', () => {
    const one = table()
    const two = table()

    const first = see(one, one.game.playerOrder[0]).hand[0]
    first.name = 'tampered'

    // The view hands out a copy of the printed record, so writing to one
    // table's screen cannot reach another's.
    const same = see(two, two.game.playerOrder[0]).hand.find(
      (c) => c.id === first.id,
    )
    if (same) expect(same.name).not.toBe('tampered')
    expect(see(one, one.game.playerOrder[0]).hand[0].name).not.toBe('tampered')
  })
})
