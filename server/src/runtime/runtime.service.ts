import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import {
  ActionType,
  CardType,
  ChallengeCardData,
  GameEventType,
  HeroCardData,
  IGameEvent,
  ItemCardData,
  MagicCardData,
  ModifierCardData,
  MonsterCardData,
  PartyLeaderData,
} from 'shared'
import { GameState } from '../game/game-state'
import { GameEngine } from '../game/game-engine'
import { TurnManager } from '../game/turn-manager'
import { GameEventEmitter } from '../game/events/game-event-emitter'
import { ReactionManager } from '../game/reactions/reaction-manager'
import { AbilityProcessor } from '../game/ability-processor'
import { Player } from '../game/player'
import { Party } from '../game/party'
import { CardStack } from '../game/card-stack'
import { CardPile } from '../game/card-pile'
import { HeroCard } from '../game/cards/hero-card'
import { ItemCard } from '../game/cards/item-card'
import { MagicCard } from '../game/cards/magic-card'
import { ModifierCard } from '../game/cards/modifier-card'
import { ChallengeCard } from '../game/cards/challenge-card'
import { MonsterCard } from '../game/cards/monster-card'
import { PartyLeaderCard } from '../game/cards/party-leader-card'
import { DrawCardAction } from '../game/actions/draw-card-action'
import { PlayHeroAction } from '../game/actions/play-hero-action'
import { PlayItemAction } from '../game/actions/play-item-action'
import { PlayMagicAction } from '../game/actions/play-magic-action'
import { RollOnHeroAction } from '../game/actions/roll-on-hero-action'
import { AttackMonsterAction } from '../game/actions/attack-monster-action'
import { PlayModifierReaction } from '../game/reactions/play-modifier-reaction'
import { SnowballAbility } from '../game/abilities/snowball-ability'
import {
  baseChallenges,
  baseHeroes,
  baseItems,
  baseLeaders,
  baseMagic,
  baseModifiers,
  baseMonsters,
} from '../data/base-game-cards'
import { defaultGameConfig } from '../game/config/game-config'
import {
  ActionDto,
  CatalogDto,
  GameEventDto,
  GameSnapshotDto,
  ModifierReactionDto,
  ModifierWindowDto,
} from './runtime.types'

export const SOLO_PLAYER_ID = 'p1'
const SEAT_LEADERS = ['leader-116', 'leader-117', 'leader-118', 'leader-119']
const VISIBLE_MONSTERS = 3
const MODIFIER_WINDOW_MS = 5000
/** Fake opponents pass their turn after this delay until real seats exist. */
const AUTO_PASS_MS = 1500

export type CreateGameOptions = {
  /** 2..4 seats; player 1 is the local human, the rest auto-pass. */
  players?: number
  /** Disable to drive opponent seats from test scripts. */
  autoPass?: boolean
}

/**
 * Hosts one in-memory single-player game on top of the untouched game engine.
 * The socket gateway talks to this service only — it never touches the engine
 * directly. Multi-player, lobbies and per-socket identity come later.
 */
@Injectable()
export class RuntimeService {
  private gs!: GameState
  private emitter!: GameEventEmitter
  private turnManager!: TurnManager
  private reactionManager!: ReactionManager
  private abilityProcessor!: AbilityProcessor
  private engine!: GameEngine

  private catalog: CatalogDto = []
  private modifierWindow: ModifierWindowDto | null = null
  private forwarders: ((event: GameEventDto) => void)[] = []
  private playerCount = 4
  private autoPass = true
  /** Bumped on every turn/new game so stale auto-pass timers become no-ops. */
  private turnGeneration = 0

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Registers a callback invoked for every engine event (gateway broadcast). */
  subscribe(forward: (event: GameEventDto) => void): void {
    this.forwarders.push(forward)
  }

  isGameRunning(): boolean {
    return !!this.gs
  }

  /** (Re)creates a fresh game with 2–4 seats (player 1 is the human). */
  createGame(options: CreateGameOptions = {}): void {
    this.playerCount = Math.min(4, Math.max(2, options.players ?? 4))
    this.autoPass = options.autoPass ?? true
    this.turnGeneration++

    const mainDeck = new CardStack('main-deck', 'Main Deck')
    const discardPile = new CardPile('discard-pile', 'Discard Pile')
    const monsterDeck = new CardStack('monster-deck', 'Monster Deck')
    const monsterPile = new CardPile('monster-pile', 'Monster Pile')

    this.emitter = new GameEventEmitter()
    this.gs = new GameState(mainDeck, discardPile, monsterDeck, monsterPile)
    this.reactionManager = new ReactionManager(this.gs, this.emitter)
    this.abilityProcessor = new AbilityProcessor(
      this.gs,
      this.emitter,
      this.reactionManager,
    )
    this.turnManager = new TurnManager(this.gs, this.emitter)
    // No win conditions yet — endless sandbox for the solo board.
    this.engine = new GameEngine(this.gs, this.turnManager, this.emitter, [])

    this.modifierWindow = null
    this.emitter.addListener({ onEvent: (e) => this.onEngineEvent(e) })

    this.registerCards()
    this.buildDecks(mainDeck, monsterDeck, monsterPile)
    this.seatPlayers()
    this.dealStartingHands()

    this.engine.start(this.gs.getPlayers().map((p) => p.getId()))
  }

  // ---------------------------------------------------------------------------
  // Player input — the only mutations the gateway can request.
  // ---------------------------------------------------------------------------

  performAction(playerId: string, dto: ActionDto): void {
    const action = this.buildAction(playerId, dto)
    if (action) this.turnManager.enqueue(action)
  }

  submitModifier(playerId: string, dto: ModifierReactionDto): void {
    const targetPlayerId = this.modifierWindow?.rollerId ?? playerId
    this.reactionManager.submitReaction(
      new PlayModifierReaction(
        randomUUID(),
        playerId,
        dto.cardId,
        dto.value,
        targetPlayerId,
      ),
    )
  }

  /** Resolves any open reaction windows immediately (the "Skip / pass" button). */
  resolveOpenWindows(): void {
    for (const frame of this.gs.frames.values()) {
      for (const window of frame.windows) {
        if (window.isOpen()) window.resolve()
      }
    }
  }

  endTurn(): void {
    this.turnManager.endTurn()
  }

  // ---------------------------------------------------------------------------
  // Read model
  // ---------------------------------------------------------------------------

  getCatalog(): CatalogDto {
    return this.catalog
  }

  getSnapshot(): GameSnapshotDto {
    const players = this.gs.getPlayers()
    return {
      currentPlayerId: this.gs.getCurrentPlayerId(),
      players: players.map((p) => ({
        id: p.getId(),
        name: p.getName(),
        actionPoints: p.getActionPoints(),
        actionPointsPerTurn: p.getActionPointsPerTurn(),
        hand: [...p.getHand()],
      })),
      parties: players.map((p) => {
        const party = this.gs.getParty(p.getId())
        const equipped: Record<string, string> = {}
        for (const heroId of party.getHeroIds()) {
          const itemId = this.gs.getEquippedItem(heroId)
          if (itemId) equipped[heroId] = itemId
        }
        return {
          playerId: p.getId(),
          leaderId: party.getLeaderId(),
          heroIds: [...party.getHeroIds()],
          monsterIds: [...party.getMonsterIds()],
          equipped,
        }
      }),
      monsterPile: [...this.gs.getMonsterPile().getAll()],
      monsterDeckSize: this.gs.getMonsterDeck().getSize(),
      mainDeckSize: this.gs.getMainDeck().getSize(),
      discardPile: [...this.gs.getDiscardPile().getAll()],
      abilitiesUsedThisTurn: this.gs.getAbilitiesUsedThisTurn(),
      modifierWindow: this.modifierWindow,
    }
  }

  // ---------------------------------------------------------------------------
  // Engine event tap — keeps the modifier-window read model and forwards events.
  // ---------------------------------------------------------------------------

  private onEngineEvent(event: IGameEvent): void {
    const type = event.getType()
    const payload = event.getPayload() as Record<string, unknown> | undefined

    if (type === GameEventType.ModifierWindowOpened) {
      this.modifierWindow = {
        rollerId: (payload?.rollerId as string) ?? event.getPlayerId(),
        baseRoll: payload?.baseRoll as number,
        rollReq: payload?.rollReq as number | undefined,
        heroId: payload?.heroId as string | undefined,
        finalRoll: payload?.baseRoll as number,
        openedAt: Date.now(),
        timeoutMs: MODIFIER_WINDOW_MS,
      }
    } else if (type === GameEventType.ModifierApplied && this.modifierWindow) {
      this.modifierWindow = {
        ...this.modifierWindow,
        finalRoll: payload?.finalRoll as number,
        openedAt: Date.now(), // window timer resets on every modifier
      }
    } else if (type === GameEventType.ModifierWindowClosed) {
      this.modifierWindow = null
    }

    // Fake opponents: pass their turn shortly after it starts, until real
    // per-socket seats exist. Generation guard voids stale timers.
    if (type === GameEventType.TurnStarted) {
      const gen = ++this.turnGeneration
      const pid = event.getPlayerId()
      if (this.autoPass && pid !== SOLO_PLAYER_ID) {
        setTimeout(() => {
          if (gen !== this.turnGeneration) return
          if (this.gs.getCurrentPlayerId() !== pid) return
          if (this.gs.hasOpenFrames()) return
          this.turnManager.endTurn()
        }, AUTO_PASS_MS)
      }
    }

    const dto: GameEventDto = { type, playerId: event.getPlayerId(), payload }
    for (const forward of this.forwarders) forward(dto)
  }

  // ---------------------------------------------------------------------------
  // Setup helpers
  // ---------------------------------------------------------------------------

  private registerCards(): void {
    const withAbility = (data: HeroCardData): HeroCardData =>
      data.id === 'hero-040'
        ? ({ ...data, ability: SnowballAbility } as unknown as HeroCardData)
        : data

    const heroes = baseHeroes.map(withAbility)
    for (const data of heroes) this.gs.registerCard(new HeroCard(data))
    for (const data of baseItems) this.gs.registerCard(new ItemCard(data))
    for (const data of baseMagic) this.gs.registerCard(new MagicCard(data))
    for (const data of baseModifiers)
      this.gs.registerCard(new ModifierCard(data))
    for (const data of baseChallenges)
      this.gs.registerCard(new ChallengeCard(data))
    for (const data of baseMonsters) this.gs.registerCard(new MonsterCard(data))
    for (const data of baseLeaders)
      this.gs.registerCard(new PartyLeaderCard(data))

    this.catalog = [
      ...heroes,
      ...baseItems,
      ...baseMagic,
      ...baseModifiers,
      ...baseChallenges,
      ...baseMonsters,
      ...baseLeaders,
    ] as CatalogDto
  }

  private buildDecks(
    mainDeck: CardStack,
    monsterDeck: CardStack,
    monsterPile: CardPile,
  ): void {
    const mainCards: { id: string }[] = [
      ...baseHeroes,
      ...baseItems,
      ...baseMagic,
      ...baseModifiers,
      ...baseChallenges,
    ]
    for (const card of mainCards) mainDeck.addToBottom(card.id)
    mainDeck.shuffle()

    for (const monster of baseMonsters) monsterDeck.addToBottom(monster.id)
    monsterDeck.shuffle()

    for (let i = 0; i < VISIBLE_MONSTERS; i++) {
      const monsterId = monsterDeck.draw()
      if (monsterId) monsterPile.add(monsterId)
    }
  }

  private seatPlayers(): void {
    for (let seat = 0; seat < this.playerCount; seat++) {
      const id = `p${seat + 1}`
      this.gs.registerPlayer(
        new Player({
          id,
          name: `Player ${seat + 1}`,
          hand: [],
          partyId: `party-${id}`,
          actionPoints: defaultGameConfig.actionPointsPerTurn,
        }),
      )
      this.gs.registerParty(
        new Party({
          playerId: id,
          leaderId: SEAT_LEADERS[seat % SEAT_LEADERS.length],
          heroIds: [],
          monsterIds: [],
        }),
      )
    }
  }

  private dealStartingHands(): void {
    for (const player of this.gs.getPlayers()) {
      for (let i = 0; i < defaultGameConfig.startingHandSize; i++) {
        const cardId = this.gs.getMainDeck().draw()
        if (cardId) player.addToHand(cardId)
      }
    }
  }

  private buildAction(playerId: string, dto: ActionDto) {
    const id = randomUUID()
    switch (dto.type) {
      case ActionType.DrawCard:
        return new DrawCardAction(id, playerId, this.emitter)
      case ActionType.PlayHero:
        if (!dto.cardId) return null
        return new PlayHeroAction(
          id,
          playerId,
          dto.cardId,
          this.reactionManager,
          this.emitter,
        )
      case ActionType.PlayItem:
        if (!dto.cardId || !dto.targetHeroId) return null
        return new PlayItemAction(
          id,
          playerId,
          dto.cardId,
          dto.targetHeroId,
          this.reactionManager,
          this.emitter,
        )
      case ActionType.PlayMagic:
        if (!dto.cardId) return null
        return new PlayMagicAction(
          id,
          playerId,
          dto.cardId,
          this.reactionManager,
          this.emitter,
        )
      case ActionType.RollOnHero:
        if (!dto.cardId) return null
        return new RollOnHeroAction(
          id,
          playerId,
          dto.cardId,
          this.emitter,
          this.reactionManager,
        )
      case ActionType.AttackMonster:
        if (!dto.cardId) return null
        return new AttackMonsterAction(
          id,
          playerId,
          dto.cardId,
          this.reactionManager,
        )
      default:
        return null
    }
  }
}
