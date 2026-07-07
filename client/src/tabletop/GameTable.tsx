import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useGameState } from '../state/useGameState'
import { CardData, GameEventDto, SOLO_PLAYER_ID } from '../types'
import {
  accentFor,
  assignSeats,
  canAttackMonster,
  canDraw,
  canEndTurn,
  canPlayCard,
  canUseHeroEffect,
  distinctClasses,
  partyMemberClasses,
  TurnContext,
} from './model'
import PlayerZone, { ZoneInteractions } from './PlayerZone'
import MonsterCard from './cards/MonsterCard'
import CardFrame from './cards/CardFrame'
import CardStack from './CardStack'
import DiceTray from './DiceTray'
import ActionPointTracker from './ActionPointTracker'
import TurnBanner from './TurnBanner'
import GameInfoPanel from './GameInfoPanel'
import CardInspector from './CardInspector'
import ContextualActionBar, { BarAction } from './ContextualActionBar'
import GameEventLog from './GameEventLog'
import RollOverlay from './RollOverlay'
import { SkullIcon } from './icons'
import Tooltip from './Tooltip'
import './tabletop.css'
import './cards.css'
import './hud.css'

// Presentation-only feature flags for controls whose backend action does not
// exist yet. Never fake completion — render disabled with an explanation.
const UI_FLAGS = {
  discardAndRedraw: false, // rulebook action; no server ActionDto for it yet
}

const CANVAS_W = 1720
const CANVAS_H = 1040
const MIN_SCALE = 0.55

const DRAG_KEY = 'text/plain'

type Selection =
  | { kind: 'hand'; id: string }
  | { kind: 'hero'; id: string }
  | { kind: 'monster'; id: string }

// ---------------------------------------------------------------------------

function useBoardScale(): number {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const update = () =>
      setScale(
        Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H),
      )
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  // Below MIN_SCALE the viewport pans instead of shrinking the table further.
  return Math.min(1.1, Math.max(scale, MIN_SCALE))
}

// ---------------------------------------------------------------------------

export default function GameTable() {
  const game = useGameState()
  const scale = useBoardScale()

  const [selection, setSelection] = useState<Selection | null>(null)
  const [inspected, setInspected] = useState<CardData | null>(null)
  const [attackFlashId, setAttackFlashId] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cardOf = useCallback(
    (id: string): CardData | undefined => game.cards[id],
    [game.cards],
  )

  const snapshot = game.snapshot
  const me = snapshot?.players.find((p) => p.id === SOLO_PLAYER_ID)
  const myParty = snapshot?.parties.find((p) => p.playerId === SOLO_PLAYER_ID)

  const nameOf = useCallback(
    (playerId: string) =>
      snapshot?.players.find((p) => p.id === playerId)?.name ?? 'Someone',
    [snapshot],
  )
  const playerIndex = useCallback(
    (playerId: string) => {
      const i = snapshot?.players.findIndex((p) => p.id === playerId) ?? -1
      return i < 0 ? 0 : i
    },
    [snapshot],
  )

  // Clear a selection that no longer exists (card played, monster slain…).
  useEffect(() => {
    if (!selection || !snapshot || !me || !myParty) return
    const stillThere =
      (selection.kind === 'hand' && me.hand.includes(selection.id)) ||
      (selection.kind === 'hero' && myParty.heroIds.includes(selection.id)) ||
      (selection.kind === 'monster' &&
        snapshot.monsterPile.includes(selection.id))
    if (!stillThere) setSelection(null)
  }, [selection, snapshot, me, myParty])

  const onInspect = useCallback(
    (card: CardData | null) => setInspected(card),
    [],
  )

  // ---- connection / loading states ----------------------------------------

  if (!game.connected) {
    return (
      <TableShell scale={scale}>
        <BoardSkeleton message="Connecting to server…" offline />
      </TableShell>
    )
  }
  if (!snapshot || !me || !myParty) {
    return (
      <TableShell scale={scale}>
        <BoardSkeleton message="Waiting for game state…" />
      </TableShell>
    )
  }

  // ---- derived state --------------------------------------------------------

  const isMyTurn = snapshot.currentPlayerId === SOLO_PLAYER_ID
  const reactionOpen = !!snapshot.modifierWindow
  const ctx: TurnContext = {
    isMyTurn,
    reactionOpen,
    actionPoints: me.actionPoints,
  }

  const seats = assignSeats(snapshot, SOLO_PLAYER_ID)
  const currentAccent = accentFor(
    snapshot.currentPlayerId ?? SOLO_PLAYER_ID,
    playerIndex(snapshot.currentPlayerId ?? SOLO_PLAYER_ID),
  )

  const myClasses = partyMemberClasses(myParty, cardOf)
  const ownedClasses = distinctClasses(myClasses)
  const slainCount = myParty.monsterIds.length

  const selectedCard = selection ? cardOf(selection.id) : undefined
  const selectedHandCard =
    selection?.kind === 'hand' ? selectedCard : undefined
  const selectedHeroId = selection?.kind === 'hero' ? selection.id : null
  const selectedMonster =
    selection?.kind === 'monster' ? selectedCard ?? null : null

  const itemSelected = selectedHandCard?.type === 'Item'
  const partyTargetable =
    !!selectedHandCard &&
    (selectedHandCard.type === 'Hero' || selectedHandCard.type === 'Magic')

  const lastRollIndex = findLastIndex(game.log, (e) => e.type === 'DiceRolled')
  const lastRoll =
    lastRollIndex >= 0
      ? ((game.log[lastRollIndex].payload?.baseRoll as number) ?? null)
      : null

  // ---- action handlers ------------------------------------------------------

  const playSelected = () => {
    if (!selectedHandCard) return
    if (selectedHandCard.type === 'Hero') game.playHero(selectedHandCard.id)
    else if (selectedHandCard.type === 'Magic')
      game.playMagic(selectedHandCard.id)
    // Items resolve through equipToHero (a target is required).
    if (selectedHandCard.type !== 'Item') setSelection(null)
  }

  const equipToHero = (heroId: string) => {
    if (!selectedHandCard || selectedHandCard.type !== 'Item') return
    game.playItem(selectedHandCard.id, heroId)
    setSelection(null)
  }

  const useHeroEffect = () => {
    if (!selectedHeroId) return
    game.rollOnHero(selectedHeroId)
    setSelection(null)
  }

  const attackSelected = () => {
    if (!selectedMonster) return
    game.attackMonster(selectedMonster.id)
    setAttackFlashId(selectedMonster.id)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setAttackFlashId(null), 950)
    setSelection(null)
  }

  const allowDrop = (e: React.DragEvent) => e.preventDefault()
  const onDropOnParty = (e: React.DragEvent) => {
    e.preventDefault()
    const card = cardOf(e.dataTransfer.getData(DRAG_KEY))
    if (!card || !canPlayCard(ctx, card).enabled) return
    if (card.type === 'Hero') game.playHero(card.id)
    if (card.type === 'Magic') game.playMagic(card.id)
    setSelection(null)
  }
  const onDropOnHero = (e: React.DragEvent, heroId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const card = cardOf(e.dataTransfer.getData(DRAG_KEY))
    if (!card || card.type !== 'Item' || !canPlayCard(ctx, card).enabled) return
    game.playItem(card.id, heroId)
    setSelection(null)
  }

  // ---- availability + action bar -------------------------------------------

  const drawAvail = canDraw(ctx)
  const playAvail = itemSelected
    ? selectedHandCard && canPlayCard(ctx, selectedHandCard).enabled
      ? {
          enabled: false,
          reason: `Click a hero in your party to equip ${selectedHandCard?.name}.`,
        }
      : canPlayCard(ctx, selectedHandCard)
    : canPlayCard(ctx, selectedHandCard)
  const heroAvail = canUseHeroEffect(
    ctx,
    selectedHeroId,
    snapshot.abilitiesUsedThisTurn,
  )
  const attackAvail = canAttackMonster(ctx, selectedMonster, myClasses)
  const endAvail = canEndTurn(ctx)

  const barActions: BarAction[] = [
    {
      id: 'draw',
      label: 'Draw Card',
      cost: 1,
      avail: drawAvail,
      onTrigger: game.drawCard,
    },
    {
      id: 'play',
      label: selectedHandCard ? `Play ${selectedHandCard.name}` : 'Play Card',
      cost: 1,
      avail: playAvail,
      onTrigger: playSelected,
    },
    {
      id: 'effect',
      label: 'Use Hero Effect',
      cost: 1,
      avail: heroAvail,
      onTrigger: useHeroEffect,
    },
    {
      id: 'attack',
      label: selectedMonster
        ? `Attack ${selectedMonster.name}`
        : 'Attack Monster',
      cost: 2,
      avail: attackAvail,
      onTrigger: attackSelected,
    },
    {
      id: 'redraw',
      label: 'Discard & Redraw',
      cost: 3,
      avail: UI_FLAGS.discardAndRedraw
        ? canDraw(ctx)
        : { enabled: false, reason: 'Not wired to the server yet.' },
      onTrigger: () => undefined,
    },
    {
      id: 'end',
      label: 'End Turn',
      avail: endAvail,
      emphasis: 'gold',
      onTrigger: () => {
        setSelection(null)
        game.endTurn()
      },
    },
  ]

  const barHint = itemSelected
    ? `Equipping ${selectedHandCard?.name} — choose one of your heroes.`
    : undefined

  const zoneInteractions: ZoneInteractions = {
    selectedId: selectedHeroId,
    heroesAreTargets: itemSelected,
    partyIsTarget: partyTargetable,
    usedAbilities: snapshot.abilitiesUsedThisTurn,
    onSelectHero: (id) =>
      setSelection((s) =>
        s?.kind === 'hero' && s.id === id ? null : { kind: 'hero', id },
      ),
    onEquipToHero: equipToHero,
    onDropOnParty,
    onDropOnHero,
    allowDrop,
  }

  const winMet = slainCount >= 3 || ownedClasses.size >= 6

  // ---- render ----------------------------------------------------------------

  return (
    <TableShell scale={scale}>
      <div
        className={`board ${isMyTurn ? 'board-my-turn' : ''} ${reactionOpen ? 'board-reacting' : ''}`}
        onClick={() => setSelection(null)}
      >
        {seats.map((seat) => {
          const isLocal = seat.side === 'bottom'
          const accent = seat.player
            ? accentFor(seat.player.id, playerIndex(seat.player.id))
            : '#5a5348'
          return (
            <PlayerZone
              key={seat.side}
              seat={seat}
              accent={accent}
              active={
                !!seat.player && seat.player.id === snapshot.currentPlayerId
              }
              isLocal={isLocal}
              cardOf={cardOf}
              onInspect={onInspect}
              interactions={isLocal ? zoneInteractions : undefined}
            >
              {isLocal && (
                <LocalHand
                  hand={me.hand}
                  cardOf={cardOf}
                  ctx={ctx}
                  selectedId={
                    selection?.kind === 'hand' ? selection.id : null
                  }
                  onSelect={(id) =>
                    setSelection((s) =>
                      s?.kind === 'hand' && s.id === id
                        ? null
                        : { kind: 'hand', id },
                    )
                  }
                  onInspect={onInspect}
                />
              )}
            </PlayerZone>
          )
        })}

        {/* --- shared center: monsters ---------------------------------- */}
        <section className="encounter" aria-label="Monsters">
          <span className="zone-caption encounter-caption">Monster Cards</span>
          <div className="encounter-row">
            {snapshot.monsterPile.map((id) => {
              const card = cardOf(id)
              const avail = card
                ? canAttackMonster(ctx, card, myClasses)
                : { enabled: false }
              return (
                <Tooltip
                  key={id}
                  text={
                    avail.enabled
                      ? 'Select, then Attack (2 AP)'
                      : avail.reason
                  }
                >
                  <MonsterCard
                    card={card}
                    attackable={avail.enabled}
                    underAttack={attackFlashId === id}
                    selected={selection?.kind === 'monster' && selection.id === id}
                    onInspect={onInspect}
                    onActivate={() =>
                      setSelection((s) =>
                        s?.kind === 'monster' && s.id === id
                          ? null
                          : { kind: 'monster', id },
                      )
                    }
                  />
                </Tooltip>
              )
            })}
          </div>
        </section>

        {/* --- shared center: decks, discard, dice, trophies -------------- */}
        <section className="center-row" aria-label="Decks and dice">
          <CardStack
            label="Monster Deck"
            count={snapshot.monsterDeckSize}
            tooltip="New monsters are revealed from here"
          />
          <CardStack
            label="Main Deck"
            count={snapshot.mainDeckSize}
            onActivate={drawAvail.enabled ? game.drawCard : undefined}
            tooltip={
              drawAvail.enabled ? 'Draw a card (1 AP)' : undefined
            }
            disabledReason={drawAvail.enabled ? undefined : drawAvail.reason}
          />
          <CardStack
            label="Discard Pile"
            count={snapshot.discardPile.length}
            topCard={
              snapshot.discardPile.length > 0
                ? cardOf(snapshot.discardPile[0])
                : undefined
            }
            onInspect={onInspect}
          />
          <DiceTray lastRoll={lastRoll} rollKey={lastRollIndex} />
          <div className="slain-tray" aria-label="Slain monsters">
            <span className="zone-caption">Slayed Monsters</span>
            <div className="slain-tray-row">
              {myParty.monsterIds.length === 0 ? (
                <span className="slain-tray-empty" aria-hidden="true">
                  <SkullIcon size={44} color="#3a3428" />
                </span>
              ) : (
                myParty.monsterIds.map((id) => (
                  <CardFrame
                    key={id}
                    card={cardOf(id)}
                    size="xs"
                    onInspect={onInspect}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        {/* --- HUD corners ------------------------------------------------ */}
        <div className="hud-turn panel">
          <ActionPointTracker
            current={me.actionPoints}
            max={me.actionPointsPerTurn}
            disabled={!isMyTurn}
          />
          <TurnBanner
            isMyTurn={isMyTurn}
            currentPlayerName={nameOf(snapshot.currentPlayerId ?? '')}
            accent={currentAccent}
          />
          <button className="btn btn-quiet" onClick={game.startGame}>
            ↻ New Game
          </button>
        </div>

        <GameInfoPanel
          slainCount={slainCount}
          slainTarget={3}
          ownedClasses={ownedClasses}
          classTarget={6}
        />

        <GameEventLog
          log={game.log}
          cardOf={cardOf}
          nameOf={nameOf}
          playerIndex={playerIndex}
        />

        <ContextualActionBar actions={barActions} hint={barHint} />

        <CardInspector card={inspected} />

        {winMet && (
          <div className="win-ribbon" role="status">
            👑 Victory conditions met!
          </div>
        )}

        {snapshot.modifierWindow && (
          <RollOverlay
            window={snapshot.modifierWindow}
            rollerName={nameOf(snapshot.modifierWindow.rollerId)}
            hero={
              snapshot.modifierWindow.heroId
                ? cardOf(snapshot.modifierWindow.heroId)
                : undefined
            }
            hand={me.hand}
            cardOf={cardOf}
            onPlayModifier={game.playModifier}
            onSkip={game.skipWindow}
          />
        )}

        <BoardToast log={game.log} cardOf={cardOf} nameOf={nameOf} />
      </div>
    </TableShell>
  )
}

// ---------------------------------------------------------------------------
// Table shell: wooden frame + scaled fixed-size canvas (pans when clamped)
// ---------------------------------------------------------------------------

function TableShell({
  scale,
  children,
}: {
  scale: number
  children: React.ReactNode
}) {
  return (
    <div className="table-viewport">
      <div
        className="table-scaler"
        style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}
      >
        <div
          className="table-canvas"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Local hand fan
// ---------------------------------------------------------------------------

function LocalHand(props: {
  hand: string[]
  cardOf: (id: string) => CardData | undefined
  ctx: TurnContext
  selectedId: string | null
  onSelect: (id: string) => void
  onInspect: (card: CardData | null, e?: React.SyntheticEvent) => void
}) {
  const mid = (props.hand.length - 1) / 2
  return (
    <div className="local-hand" aria-label={`Your hand, ${props.hand.length} cards`}>
      <span className="zone-caption">
        Your Hand <span className="hand-count">{props.hand.length}</span>
      </span>
      <div className="local-hand-fan">
        {props.hand.map((id, i) => {
          const card = props.cardOf(id)
          const playable = card ? canPlayCard(props.ctx, card).enabled : false
          const rot = (i - mid) * Math.min(30 / Math.max(props.hand.length, 1), 4)
          return (
            <div
              key={id}
              className={`hand-slot ${props.selectedId === id ? 'hand-slot-selected' : ''}`}
              style={{ '--rot': `${rot}deg`, zIndex: 10 + i } as React.CSSProperties}
            >
              <CardFrame
                card={card}
                size="sm"
                selected={props.selectedId === id}
                highlight={playable ? 'playable' : 'none'}
                onActivate={() => props.onSelect(id)}
                onInspect={props.onInspect}
                draggable={playable}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_KEY, id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
              />
            </div>
          )
        })}
        {props.hand.length === 0 && (
          <div className="party-empty-slot" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton + toast
// ---------------------------------------------------------------------------

function BoardSkeleton({
  message,
  offline = false,
}: {
  message: string
  offline?: boolean
}) {
  return (
    <div className="board board-skeleton" aria-busy="true">
      <div className="skel-zone skel-top" />
      <div className="skel-zone skel-left" />
      <div className="skel-zone skel-right" />
      <div className="skel-zone skel-bottom" />
      <div className="skel-monsters">
        <span className="skel-card" />
        <span className="skel-card" />
        <span className="skel-card" />
      </div>
      <div className="skel-decks">
        <span className="skel-card skel-card-sm" />
        <span className="skel-card skel-card-sm" />
        <span className="skel-card skel-card-sm" />
      </div>
      <div className={`board-status ${offline ? 'board-status-offline' : ''}`}>
        {offline && <span className="status-dot" aria-hidden="true" />}
        {message}
      </div>
    </div>
  )
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i
  return -1
}

function BoardToast(props: {
  log: GameEventDto[]
  cardOf: (id: string) => CardData | undefined
  nameOf: (playerId: string) => string
}) {
  const [toast, setToast] = useState<{
    text: string
    bad: boolean
    key: number
  } | null>(null)
  const seenRef = useRef(0)

  useEffect(() => {
    for (let i = seenRef.current; i < props.log.length; i++) {
      const e = props.log[i]
      const cardId = e.payload?.cardId as string | undefined
      const name = cardId ? (props.cardOf(cardId)?.name ?? '') : ''
      let text: string | null = null
      let bad = false
      if (e.type === 'MonsterSlain')
        text = `🏆 ${props.nameOf(e.playerId)} slew ${name}!`
      if (e.type === 'MonsterAttackFail') {
        text = `💥 ${name} fights back!`
        bad = true
      }
      if (e.type === 'RollSuccess') text = `✨ ${name}'s effect triggers!`
      if (text) setToast({ text, bad, key: Date.now() + i })
    }
    seenRef.current = props.log.length
  }, [props.log, props.cardOf, props.nameOf])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null
  return (
    <div
      key={toast.key}
      role="status"
      className={`board-toast ${toast.bad ? 'board-toast-bad' : ''}`}
    >
      {toast.text}
    </div>
  )
}
