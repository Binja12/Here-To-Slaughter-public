import {
  CardView,
  CommandResult,
  GameCommand,
  GameSnapshot,
  HeroInPlayView,
  PendingWindowView,
  PlayerView,
  RefusalReason,
} from '../contract'
import { midGame, shadowClaw, threeSeatOpening } from '../fixtures/views'
import { GameEvents, GamePort } from './GamePort'

const freshDeadline = (duration = 45_000) => Date.now() + duration

const copyOf = <Card extends CardView>(card: Card, id: string): Card =>
  ({ ...card, id }) as Card

const makeInitialView = (): PlayerView => {
  const mine = midGame.parties[0]
  const second = midGame.parties[1]
  const third = midGame.parties[2]
  const ring = mine.heroes[0].equippedItem
  const mask = mine.heroes[2].equippedItem

  const heroOnBoard = (
    source: HeroInPlayView,
    prefix: string,
    equippedItem?: CardView,
  ): HeroInPlayView => ({
    card: copyOf(source.card, `${prefix}-hero`),
    equippedItem: equippedItem
      ? copyOf(equippedItem, `${prefix}-item`)
      : undefined,
    canRollOn: source.canRollOn,
  })

  const partyExtras = (
    source: PlayerView['parties'][number],
    prefix: string,
  ) => ({
    monsters: source.monsters.map((card, index) =>
      copyOf(card, `${prefix}-monster-${index}`),
    ),
    // Magic cards resolve into the discard pile; they are never attachments
    // beneath a party leader or hero.
    instanceCards: [],
  })

  const fourthSeat = {
    ...threeSeatOpening.seats[2],
    playerId: 'player-d',
    name: 'Ember',
    seat: 3,
    isCurrentTurn: false,
    actionPoints: 3,
    handCount: 6,
    effects: [],
  }

  const discardSeed = [
    ...midGame.discardPile.map((card, index) =>
      copyOf(card, `fake-discard-${index}`),
    ),
    ...midGame.hand.slice(0, 3).map((card, index) =>
      copyOf(card, `fake-discard-extra-${index}`),
    ),
  ]
  const discardStubs = Array.from({ length: 15 }, (_, index) =>
    copyOf(discardSeed[index % discardSeed.length], `fake-discard-stub-${index}`),
  )

  return {
    ...threeSeatOpening,
    gameId: 'fake-game',
    seats: [
      ...threeSeatOpening.seats.map((seat, index) => ({
        ...seat,
        seat: index,
        handCount: index === 0 ? threeSeatOpening.hand.length : 5 + index,
      })),
      fourthSeat,
    ],
    parties: [
      {
        ...mine,
        // the viewer always leads with The Shadow Claw (the owner wants to
        // exercise its steal-a-card ability in every test)
        leader: copyOf(shadowClaw, 'fake-a-leader'),
        heroes: [
          heroOnBoard(mine.heroes[0], 'fake-a-0', ring),
          heroOnBoard(mine.heroes[1], 'fake-a-1', mask),
          heroOnBoard(mine.heroes[2], 'fake-a-2', mask),
        ],
        ...partyExtras(mine, 'fake-a'),
        canRollOnLeader: true,
      },
      {
        ...second,
        playerId: threeSeatOpening.seats[1].playerId,
        leader: copyOf(second.leader, 'fake-b-leader'),
        heroes: [
          heroOnBoard(second.heroes[0], 'fake-b-0', ring),
          heroOnBoard(mine.heroes[1], 'fake-b-1', mask),
        ],
        ...partyExtras(second, 'fake-b'),
      },
      {
        ...third,
        playerId: threeSeatOpening.seats[2].playerId,
        leader: copyOf(third.leader, 'fake-c-leader'),
        heroes: [
          heroOnBoard(third.heroes[0], 'fake-c-0', ring),
          heroOnBoard(mine.heroes[0], 'fake-c-1', mask),
        ],
        ...partyExtras(third, 'fake-c'),
      },
      {
        ...mine,
        playerId: fourthSeat.playerId,
        leader: copyOf(mine.leader, 'fake-d-leader'),
        heroes: [
          heroOnBoard(mine.heroes[1], 'fake-d-0', ring),
          heroOnBoard(mine.heroes[2], 'fake-d-1', mask),
          heroOnBoard(second.heroes[0], 'fake-d-2', ring),
        ],
        ...partyExtras(mine, 'fake-d'),
        canRollOnLeader: false,
      },
    ],
    hand: threeSeatOpening.hand,
    discardPile: [...discardSeed, ...discardStubs],
    attackableMonsterIds: [threeSeatOpening.monsterRow[1].id],
    revealedCards: [],

    pendingWindows: [],
    turnClock: { turnTimeMs: 60_000, deadline: Date.now() + 60_000 },
    busy: false,
    acceptsActions: true,
    phase: 'Turns',
  }
}

export class FakeGamePort implements GamePort {
  private view = makeInitialView()
  private version = 0
  private events: GameEvents | null = null
  private timers: number[] = []

  connect(webSocketUrl: string, events: GameEvents): () => void {
    void webSocketUrl
    if (this.view.phase === 'Concluded') {
      this.view = makeInitialView()
      this.version = 0
    }
    this.events = events
    events.onConnected?.({ gameId: this.view.gameId, config: {
      actionPointsPerTurn: 3, cardSets: ['base'], turnTimeMs: 60_000, reactionTimeMs: 45_000,
      seamlessReactions: true, requireAllWinConditions: false,
      winConditions: [{ type: 'SlayMonsters', value: 3 }, { type: 'PartyClasses', value: 6 }],
    } })
    events.onConnectionChange?.(true)
    this.after(0, () => events.onStarted(this.snapshot()))
    this.after(4000, () => this.openChallenge())
    // an OPPONENT's attack roll a little later, to see the red glow on the
    // monster and under their dice
    this.after(9000, () => this.openEnemyAttack())

    return () => {
      this.timers.forEach((timer) => window.clearTimeout(timer))
      this.timers = []
      if (this.events === events) this.events = null
      events.onConnectionChange?.(false)
    }
  }

  async send(command: GameCommand): Promise<CommandResult> {
    if (command.type === 'LeaveGame') {
      return this.view.phase === 'Concluded'
        ? { commandId: command.commandId, accepted: true }
        : {
            commandId: command.commandId,
            accepted: false,
            reason: RefusalReason.GameNotOver,
          }
    }

    if (this.view.phase === 'Concluded') {
      return {
        commandId: command.commandId,
        accepted: false,
        reason: RefusalReason.GameOver,
      }
    }

    switch (command.type) {
      case 'DrawCard':
        this.drawCard()
        break
      case 'PlayHero':
        this.playHero(command.payload.cardId)
        break
      case 'PlayItem':
        this.playItem(command.payload.cardId, command.payload.targetHeroId)
        break
      case 'PlayMagic':
        this.playMagic(command.payload.cardId)
        break
      case 'RollOnHero':
        this.openRoll('Modifier', command.payload.heroId)
        break
      case 'RollOnLeader':
        // The Shadow Claw: pick another player to pull a card from — the
        // engine's PlayerChoice, options are player ids
        this.upsertWindow({
          windowId: 'fake-steal-target',
          type: 'PlayerChoice',
          respondentId: this.view.playerId,
          options: this.view.seats
            .filter((seat) => seat.playerId !== this.view.playerId)
            .map((seat) => seat.playerId),
          detail: { question: 'Pull a card from whose hand?' },
          deadline: freshDeadline(10_000),
          isYours: true,
        })
        this.after(10_000, () => this.closeWindow('fake-steal-target'))
        break
      case 'AttackMonster':
        this.openRoll('Attack', command.payload.monsterId)
        break
      case 'ReDraw':
        this.view = { ...this.view, hand: [...this.view.hand].reverse() }
        this.publish()
        break
      case 'EndTurn':
        this.endTurn()
        break
      case 'ApplyModifier': {
        const { cardId, targetPlayerId, value } = command.payload
        const card = this.view.hand.find((candidate) => candidate.id === cardId)
        this.removeFromHand(cardId)
        // The server's shape: the spent card sits in its owner's instance
        // pile, the bonus lands in the roll's detail and the total moves,
        // the window's clock resets. A challenge window just closes here.
        const landed = (window: PendingWindowView): PendingWindowView => {
          const detail = window.detail ?? {}
          const previous = Array.isArray(detail.bonuses)
            ? (detail.bonuses as { cardSource: string; amount: number }[])
            : []
          const bonuses = [...previous, { cardSource: cardId, amount: value }]
          const baseRoll = typeof detail.baseRoll === 'number' ? detail.baseRoll : 0
          const finalRoll = baseRoll + bonuses.reduce((sum, bonus) => sum + bonus.amount, 0)
          return { ...window, deadline: freshDeadline(15_000), detail: { ...detail, bonuses, finalRoll } }
        }
        const aimedAt = (window: PendingWindowView) =>
          ['Modifier', 'Attack'].includes(window.type) && window.respondentId === targetPlayerId
        this.view = {
          ...this.view,
          parties: this.view.parties.map((party) =>
            card && party.playerId === this.view.playerId
              ? { ...party, instanceCards: [...party.instanceCards, card] }
              : party,
          ),
          pendingWindows: this.view.pendingWindows
            .filter((window) => !(window.type === 'Challenge' && window.respondentId === targetPlayerId))
            .map((window) => (aimedAt(window) ? landed(window) : window)),
        }
        this.publish()
        this.after(15_000, () => {
          this.view = {
            ...this.view,
            pendingWindows: this.view.pendingWindows.filter((window) => !aimedAt(window)),
          }
          this.publish()
          this.openCardChoice()
        })
        break
      }
      case 'Challenge':
        this.removeFromHand(command.payload.cardId)
        this.view = {
          ...this.view,
          pendingWindows: this.view.pendingWindows.map((window) =>
            window.type === 'Challenge' &&
            window.cardId === command.payload.targetedCardId
              ? {
                  ...window,
                  detail: {
                    ...window.detail,
                    challengeable: false,
                    challenged: true,
                    challengerId: this.view.playerId,
                    challengerRoll: 7,
                    challengedRoll: 8,
                    challengerBonuses: [],
                    challengedBonuses: [{ cardSource: 'fake-a-0-hero', amount: 1 }],
                  },
                }
              : window,
          ),
        }
        this.publish()
        // a started challenge stays open long enough to land modifiers on
        // either roll (the real server gives 5 s; the fake is for looking)
        this.after(12_000, () => this.advanceChallenge())
        break
      case 'PassWindow':
        // the temporary forfeit: the window settles at once, as a lapse would
        this.closeWindow(command.payload.windowId)
        break
      case 'SubmitChoice': {
        const answered = this.view.pendingWindows.find(
          (window) => window.windowId === command.payload.windowId,
        )
        this.closeWindow(command.payload.windowId)
        if (answered?.type === 'TaskChoice') {
          // "roll on the played hero": yes opens its roll, no just closes
          const heroId = answered.detail?.cardId
          if (command.payload.choice === 'confirm' && typeof heroId === 'string') {
            this.openRoll('Modifier', heroId)
          }
          break
        }
        this.after(1200, () => this.complete())
        break
      }
    }
    return { commandId: command.commandId, accepted: true }
  }

  private drawCard() {
    const source = midGame.hand.find(
      (card) => !this.view.hand.some((held) => held.id === card.id),
    )
    if (!source) return
    this.view = {
      ...this.view,
      hand: [...this.view.hand, source],
      mainDeck: { count: Math.max(0, this.view.mainDeck.count - 1) },
    }
    this.publish()
  }

  private playHero(cardId: string) {
    const card = this.view.hand.find(
      (candidate) => candidate.id === cardId && candidate.type === 'Hero',
    )
    const party = this.mine()
    if (!card || !party) return
    this.removeFromHand(cardId)
    this.replaceParty({
      ...party,
      heroes: [...party.heroes, { card, canRollOn: true }],
    })
    // like the engine: a played hero asks whether to roll on it right away
    // (TaskChoice, options confirm / dismiss, the hero in detail.cardId)
    this.upsertWindow({
      windowId: `fake-roll-on-${card.id}`,
      type: 'TaskChoice',
      respondentId: this.view.playerId,
      options: ['confirm', 'dismiss'],
      // the server's shape exactly: the hero is `sourceCardId`, no `cardId`
      detail: { confirms: 'RollOnPlayedHero', sourceCardId: card.id },
      deadline: freshDeadline(8_000),
      isYours: true,
    })
    this.after(8_000, () => {
      if (this.view.pendingWindows.some((w) => w.windowId === `fake-roll-on-${card.id}`)) {
        this.closeWindow(`fake-roll-on-${card.id}`)
      }
    })
  }

  private closeWindow(windowId: string) {
    this.view = {
      ...this.view,
      pendingWindows: this.view.pendingWindows.filter((w) => w.windowId !== windowId),
    }
    this.publish()
  }

  private playItem(cardId: string, heroId: string) {
    const card = this.view.hand.find(
      (candidate) => candidate.id === cardId && candidate.type === 'Item',
    )
    if (!card) return
    const parties = this.view.parties.map((party) => ({
      ...party,
      heroes: party.heroes.map((hero) =>
        hero.card.id === heroId ? { ...hero, equippedItem: card } : hero,
      ),
    }))
    this.removeFromHand(cardId)
    this.view = { ...this.view, parties }
    this.publish()
  }

  private playMagic(cardId: string) {
    const card = this.view.hand.find(
      (candidate) => candidate.id === cardId && candidate.type === 'Magic',
    )
    if (!card) return
    this.removeFromHand(cardId)
    this.view = {
      ...this.view,
      discardPile: [card, ...this.view.discardPile],
    }
    this.publish()
  }

  private endTurn() {
    this.view = {
      ...this.view,
      currentPlayerId: this.view.seats[1].playerId,
      seats: this.view.seats.map((seat, index) => ({
        ...seat,
        isCurrentTurn: index === 1,
      })),
    }
    this.publish()
    this.after(1200, () => {
      this.view = {
        ...this.view,
        currentPlayerId: this.view.playerId,
        seats: this.view.seats.map((seat) => ({
          ...seat,
          isCurrentTurn: seat.playerId === this.view.playerId,
        })),
      }
      this.publish()
    })
  }

  private openChallenge() {
    const challengedMagic = this.view.discardPile.find(
      (card) => card.type === 'Magic',
    )
    if (!challengedMagic) return
    const opponentId = this.view.parties[1].playerId
    this.view = {
      ...this.view,
      currentPlayerId: opponentId,
      seats: this.view.seats.map((seat) => ({
        ...seat,
        isCurrentTurn: seat.playerId === opponentId,
      })),
    }
    this.upsertWindow({
      windowId: 'fake-challenge',
      type: 'Challenge',
      respondentId: this.view.parties[1].playerId,
      cardId: challengedMagic.id,
      // The server's ChallengeWindow.getDetail() shape before anyone answers.
      detail: {
        defenderId: this.view.parties[1].playerId,
        cardId: challengedMagic.id,
        challengeable: true,
        challenged: false,
        challengerId: undefined,
        challengerRoll: 0,
        challengedRoll: 0,
        challengerBonuses: [],
        challengedBonuses: [],
      },
      deadline: freshDeadline(),
      isYours: false,
    })
    this.after(45_000, () => this.advanceChallenge())
  }

  private advanceChallenge() {
    if (!this.hasWindow('Challenge')) return
    this.closeType('Challenge')
    this.openModifier()
  }

  private openModifier() {
    const hero = this.mine()?.heroes[0]
    const affectedCard = hero?.equippedItem ?? hero?.card
    if (!affectedCard) return
    this.openRoll('Modifier', affectedCard.id)
    this.after(45_000, () => {
      if (!this.hasWindow('Modifier')) return
      this.closeType('Modifier')
      this.openCardChoice()
    })
  }

  private openEnemyAttack() {
    const attacker = this.view.parties[1]?.playerId
    const monster = this.view.monsterRow[0]
    if (!attacker || !monster) return
    this.upsertWindow({
      windowId: 'fake-enemy-attack',
      type: 'Attack',
      respondentId: attacker,
      detail: {
        rollerId: attacker,
        baseRoll: 6,
        bonuses: [{ cardSource: this.view.parties[1].leader.id, amount: 1 }],
        finalRoll: 7,
        monsterId: monster.id,
      },
      deadline: freshDeadline(20_000),
      isYours: false,
    })
    this.after(20_000, () => this.closeWindow('fake-enemy-attack'))
  }

  private openRoll(type: 'Modifier' | 'Attack', cardId: string) {
    this.upsertWindow({
      windowId: `fake-${type.toLowerCase()}`,
      type,
      respondentId: this.view.playerId,
      cardId,
      // The server's ModifiableRollWindow.getDetail() shape: a hero roll
      // carries { rollReq, heroId }, an attack { monsterId }.
      detail: {
        rollerId: this.view.playerId,
        baseRoll: 7,
        bonuses: [{ cardSource: cardId, amount: 1 }],
        finalRoll: 8,
        ...(type === 'Attack' ? { monsterId: cardId } : { rollReq: 9, heroId: cardId }),
      },
      deadline: freshDeadline(),
      isYours: true,
    })
  }

  private openCardChoice() {
    const options = this.view.hand.slice(0, 3).map((card) => card.id)
    // the server's shape: the options as cards too, and the card that asks
    const leader = this.view.parties.find((party) => party.playerId === this.view.playerId)?.leader
    this.upsertWindow({
      windowId: 'fake-card-choice',
      type: 'CardChoice',
      respondentId: this.view.playerId,
      options,
      optionCards: this.view.hand.slice(0, 3),
      detail: { question: 'Choose a card to discard.', sourceCardId: leader?.id },
      deadline: freshDeadline(),
      isYours: true,
    })
    this.after(45_000, () => {
      if (this.hasWindow('CardChoice')) this.complete()
    })
  }

  private hasWindow(type: PendingWindowView['type']) {
    return this.view.pendingWindows.some((window) => window.type === type)
  }

  private closeType(type: PendingWindowView['type']) {
    this.view = {
      ...this.view,
      pendingWindows: this.view.pendingWindows.filter(
        (window) => window.type !== type,
      ),
    }
    this.publish()
  }

  private complete() {
    this.view = {
      ...this.view,
      phase: 'Concluded',
      winnerId: this.view.playerId,
      currentPlayerId: undefined,
      busy: false,
      acceptsActions: true,
      revealedCards: [],

      pendingWindows: [],
      seats: this.view.seats.map((seat) => ({
        ...seat,
        isCurrentTurn: false,
      })),
    }
    const snapshot = this.nextSnapshot()
    this.events?.onCompleted(snapshot)
  }

  private upsertWindow(window: PendingWindowView) {
    this.view = {
      ...this.view,
      revealedCards: [],

      pendingWindows: [
        ...this.view.pendingWindows.filter(
          (candidate) => candidate.windowId !== window.windowId,
        ),
        { ...window,
          optional: window.options?.includes('dismiss') ?? false,
          canPass: window.type === 'Modifier' || window.type === 'Attack' ||
            (window.type === 'Challenge' && (window.detail?.challenged === true || !window.isYours)),
        },
      ],
    }
    this.publish()
  }

  private removeFromHand(cardId: string) {
    this.view = {
      ...this.view,
      hand: this.view.hand.filter((card) => card.id !== cardId),
    }
  }

  private mine() {
    return this.view.parties.find(
      (party) => party.playerId === this.view.playerId,
    )
  }

  private replaceParty(replacement: PlayerView['parties'][number]) {
    this.view = {
      ...this.view,
      parties: this.view.parties.map((party) =>
        party.playerId === replacement.playerId ? replacement : party,
      ),
    }
    this.publish()
  }

  private publish() {
    this.events?.onSnapshot(this.nextSnapshot())
  }

  private snapshot(): GameSnapshot {
    return {
      gameId: this.view.gameId,
      version: this.version,
      state: structuredClone(this.view),
    }
  }

  private nextSnapshot(): GameSnapshot {
    this.version += 1
    return this.snapshot()
  }

  private after(delay: number, callback: () => void) {
    this.timers.push(window.setTimeout(callback, delay))
  }
}
