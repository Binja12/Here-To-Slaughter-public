import { GameEventType, PlayerView, ReactionWindowType, RefusalReason } from 'shared'
import { CONFIRM } from '../reactions/task-choice-window'
import { PlayChallengeReaction } from '../reactions/play-challenge-reaction'
import { PlayModifierReaction } from '../reactions/play-modifier-reaction'
import {
  Table,
  SEATS,
  stacked,
  see,
  board,
  active,
  seatOf,
  partyOf,
  inDiscard,
  ofType,
  payloads,
  react,
  answer,
  playHero,
  playMagic,
  playItem,
  rollOnHero,
  rollOnLeader,
  attack,
  pass,
  redraw,
  settle,
  windowFor,
  actionId,
  HIGHEST,
  LOWEST,
  MIDDLING,
  fixDice,
  scriptDice,
} from './play-through-helpers'

// ---------------------------------------------------------------------------
// One game, first turn to GameEnded, through the four player doors. The deal
// is stacked so every hand is known, the dice are scripted per roll, and one
// slain monster wins.
// ---------------------------------------------------------------------------

const [ALICE, BOB, CAROL] = SEATS

/**
 * Every non-monster card on the table, counted the way a seat sees it: named
 * where face up, counted where face down. The deal is the only source of
 * cards, so this total must never move.
 */
function mainCardsOnTable(v: PlayerView): number {
  const others = v.seats
    .filter((s) => s.playerId !== v.playerId)
    .reduce((n, s) => n + s.handCount, 0)
  const inParties = v.parties.reduce(
    (n, p) =>
      n +
      p.heroes.length +
      p.heroes.filter((h) => h.equippedItem).length +
      p.instanceCards.length,
    0,
  )
  return v.hand.length + others + v.mainDeck.count + v.discardPile.length + inParties
}

function monstersOnTable(v: PlayerView): number {
  return (
    v.monsterRow.length +
    v.monsterDeck.count +
    v.parties.reduce((n, p) => n + p.monsters.length, 0)
  )
}

/** The face-up ids one seat can name. No card may be in two places. */
function namedIds(v: PlayerView): string[] {
  return [
    ...v.hand.map((c) => c.id),
    ...v.discardPile.map((c) => c.id),
    ...v.monsterRow.map((c) => c.id),
    ...v.parties.flatMap((p) => [
      ...p.heroes.map((h) => h.card.id),
      ...p.heroes.flatMap((h) => (h.equippedItem ? [h.equippedItem.id] : [])),
      ...p.instanceCards.map((c) => c.id),
      ...p.monsters.map((c) => c.id),
    ]),
  ]
}

const between = (t: Table) => {
  const v = board(t)
  expect(v.pendingWindows).toEqual([])
  expect(v.busy).toBe(false)
}

describe('a full game', () => {
  afterEach(() => jest.restoreAllMocks())

  it('is played from the first turn to GameEnded', async () => {
    const t = stacked({
      seats: SEATS,
      handSize: 5,
      winAt: 1,
      slack: 10,
      monsters: ['monster-130'], // Terratuga: one hero of any class, 11 to slay, 7 and under fights back
      deck: [
        // Alice
        'hero-044', // Napping Nibbles — played, challenged, defeated
        'hero-037', // Whiskers (needs 11) — played, challenged, survives; rolled on twice
        'modifier-086', // [3, -1] — turns Whiskers' 8 into 11
        'magic-053', // Critical Boost — draw 3, discard 1, pauses on a choice
        'item-067', // Fighter Mask — equipped onto Whiskers
        // Bob
        'challenge-102', // spent on Napping Nibbles
        'hero-001', // Bad Axe — Bob's hero, so he can attack
        'hero-004',
        'hero-005',
        'hero-006',
        // Carol
        'challenge-103', // spent on Whiskers
        'hero-002',
        'hero-003',
        'hero-008',
        'hero-009',
        // Carol's redraw takes the next five
        'hero-010', // Carol's hero, so she can attack
        'hero-011',
        'hero-012',
        'hero-013',
        'hero-014',
        // Critical Boost takes the next three
        'hero-015', // the one Alice discards
        'hero-016',
        'hero-017',
      ],
    })

    const opening = see(t, ALICE)
    const mainCards = mainCardsOnTable(opening)
    const monsters = monstersOnTable(opening)
    expect(opening.mainDeck.count).toBe(10)

    // ----- Turn 1: Alice ---------------------------------------------------
    expect(active(t)).toBe(ALICE)

    // A play that loses its challenge: challenger 11, defender 1.
    playHero(t, ALICE, 'hero-044')
    await windowFor(t, ALICE, ReactionWindowType.Challenge)
    scriptDice([HIGHEST, LOWEST], LOWEST)
    react(t, new PlayChallengeReaction(actionId(), BOB, 'challenge-102'))
    await settle(t)

    expect(partyOf(see(t, ALICE), ALICE).heroes).toEqual([])
    expect(inDiscard(see(t, ALICE), 'hero-044')).toBe(true)
    expect(inDiscard(see(t, ALICE), 'challenge-102')).toBe(true)
    expect(payloads(t, GameEventType.ChallengeResolved)[0]['defenderWins']).toBe(false)

    // A play that survives its challenge: challenger 1, defender 11 — then
    // the roll it is offered, taken up, comes up 8 against Whiskers' 11.
    playHero(t, ALICE, 'hero-037')
    await windowFor(t, ALICE, ReactionWindowType.Challenge)
    scriptDice([LOWEST, HIGHEST], HIGHEST)
    react(t, new PlayChallengeReaction(actionId(), CAROL, 'challenge-103'))
    const offer = await windowFor(t, ALICE, ReactionWindowType.TaskChoice)
    fixDice(MIDDLING)
    answer(t, offer, CONFIRM)
    await settle(t)

    expect(partyOf(see(t, ALICE), ALICE).heroes.map((h) => h.card.id)).toEqual(['hero-037'])
    expect(payloads(t, GameEventType.ChallengeResolved)[1]['defenderWins']).toBe(true)
    expect(payloads(t, GameEventType.RollFailed).map((p) => p['cardId'])).toContain('hero-037')
    expect(seatOf(see(t, ALICE), ALICE).actionPoints).toBe(1)

    // One point left and nothing worth spending it on: pass.
    pass(t, ALICE)
    await settle(t)
    expect(active(t)).toBe(BOB)
    between(t)

    // ----- Turn 1: Bob -----------------------------------------------------
    playHero(t, BOB, 'hero-001')
    await settle(t) // nobody challenges; the roll offer lapses
    expect(see(t, BOB).attackableMonsterIds).toContain('monster-130')

    // An 8 MISSES Terratuga — above its fight-back band (7 and under, which
    // now costs the attacker a hero) and below the slay (11+): the monster
    // stays, Bob keeps Bad Axe for Alice to steal next turn.
    fixDice(MIDDLING)
    attack(t, BOB, 'monster-130')
    await settle(t)

    expect(ofType(t, GameEventType.MonsterFoughtBack)).toEqual([])
    expect(ofType(t, GameEventType.MonsterSlain)).toEqual([])
    expect(board(t).monsterRow.map((m) => m.id)).toContain('monster-130')
    // Play (1) plus attack (2) is the whole budget.
    expect(active(t)).toBe(CAROL)
    between(t)

    // ----- Turn 1: Carol ---------------------------------------------------
    // Four cards left after the challenge; redraw discards them and draws five.
    redraw(t, CAROL)
    await settle(t)

    const carol = see(t, CAROL)
    expect(carol.hand.map((c) => c.id)).toEqual(['hero-010', 'hero-011', 'hero-012', 'hero-013', 'hero-014'])
    expect(ofType(t, GameEventType.CardDiscarded).filter((e) => e.getPlayerId() === CAROL)).toHaveLength(4)
    expect(active(t)).toBe(ALICE)
    between(t)

    // ----- Turn 2: Alice ---------------------------------------------------
    expect(partyOf(see(t, ALICE), ALICE).heroes[0].canRollOn).toBe(true)

    // Rolling on Whiskers with an action: 8 again, and this time a modifier
    // played on the roll turns it into 11.
    fixDice(MIDDLING)
    rollOnHero(t, ALICE, 'hero-037')
    await windowFor(t, ALICE, ReactionWindowType.Modifier)
    react(t, new PlayModifierReaction(actionId(), ALICE, 'modifier-086', 3))
    const whiskersSteal = await windowFor(
      t,
      ALICE,
      ReactionWindowType.CardChoice,
    )
    expect(whiskersSteal.options).toContain('hero-001')
    answer(t, whiskersSteal, 'hero-001')
    const whiskersDestroy = await windowFor(
      t,
      ALICE,
      ReactionWindowType.CardChoice,
    )
    expect(whiskersDestroy.options).toContain('hero-001')
    answer(t, whiskersDestroy, 'hero-001')
    await settle(t)

    const applied = payloads(t, GameEventType.ModifierApplied)
    expect(applied).toHaveLength(1)
    expect(applied[0]['finalRoll']).toBe(11)
    expect(payloads(t, GameEventType.RollSuccess).map((p) => p['cardId'])).toContain('hero-037')
    expect(inDiscard(see(t, ALICE), 'modifier-086')).toBe(true)
    expect(inDiscard(see(t, ALICE), 'hero-001')).toBe(true)

    // Critical Boost: draw three, pause on which to discard.
    playMagic(t, ALICE, 'magic-053')
    const pick = await windowFor(t, ALICE, ReactionWindowType.CardChoice)
    expect(pick.options).toEqual(expect.arrayContaining(['hero-015', 'hero-016', 'hero-017']))
    answer(t, pick, 'hero-015')
    await settle(t)

    const boosted = see(t, ALICE)
    expect(boosted.hand.map((c) => c.id)).toEqual(expect.arrayContaining(['hero-016', 'hero-017', 'item-067']))
    expect(inDiscard(boosted, 'hero-015')).toBe(true)
    expect(inDiscard(boosted, 'magic-053')).toBe(true)
    expect(partyOf(boosted, ALICE).instanceCards).toEqual([])

    // The mask goes onto Whiskers, and that is the last point.
    playItem(t, ALICE, 'item-067', 'hero-037')
    await settle(t)

    expect(partyOf(see(t, ALICE), ALICE).heroes[0].equippedItem?.id).toBe('item-067')
    expect(active(t)).toBe(BOB)
    between(t)

    // ----- Turn 2: Bob -----------------------------------------------------
    // Bob's leader is the Cloaked Sage, a passive: nothing to activate. The
    // view never offers it and the engine refuses it, and the point stays.
    const leaderId = partyOf(see(t, BOB), BOB).leader.id
    expect(partyOf(see(t, BOB), BOB).canRollOnLeader).toBe(false)
    expect(rollOnLeader(t, BOB, leaderId)).toEqual({
      accepted: false,
      reason: RefusalReason.LeaderNotActivatable,
    })
    await settle(t)

    expect(payloads(t, GameEventType.RollSuccess).map((p) => p['cardId'])).not.toContain(leaderId)
    expect(seatOf(see(t, BOB), BOB).actionPoints).toBe(3)

    pass(t, BOB)
    await settle(t)
    expect(active(t)).toBe(CAROL)
    between(t)

    // ----- Turn 2: Carol ---------------------------------------------------
    playHero(t, CAROL, 'hero-010')
    await settle(t)

    // A 12 slays Terratuga, and one monster wins this table.
    fixDice(HIGHEST)
    attack(t, CAROL, 'monster-130')
    await settle(t)

    const end = see(t, CAROL)
    expect(ofType(t, GameEventType.MonsterSlain)).toHaveLength(1)
    expect(partyOf(end, CAROL).monsters.map((m) => m.id)).toEqual(['monster-130'])
    expect(end.monsterRow).toHaveLength(3)
    expect(end.monsterRow.map((m) => m.id)).not.toContain('monster-130')

    const ended = payloads(t, GameEventType.GameEnded)
    expect(ended).toHaveLength(1)
    expect(ended[0]['winnerId']).toBe(CAROL)
    expect(end.winnerId).toBe(CAROL)
    expect(see(t, ALICE).winnerId).toBe(CAROL)
    expect(end.pendingWindows).toEqual([])
    expect(end.busy).toBe(false)

    // ----- Nothing was lost and nothing was doubled --------------------------
    for (const seat of SEATS) {
      const v = see(t, seat)
      expect(mainCardsOnTable(v)).toBe(mainCards)
      expect(monstersOnTable(v)).toBe(monsters)
      const ids = namedIds(v)
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(ofType(t, GameEventType.TurnStarted)).toHaveLength(6)
  }, 60000)
})
