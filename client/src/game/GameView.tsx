import React, { useEffect, useMemo, useRef, useState } from 'react'
import Card, { cardTemplate } from '../components/Card'
import BoardFrame from '../components/board/BoardFrame'
import DiceRoller from '../components/board/DiceRoller'
import DeckPile from '../components/board/DeckPile'
import ActionPointDisplay from '../components/board/ActionPointDisplay'
import { useGameState } from '../state/useGameState'
import {
  CardData,
  GameEventDto,
  PartyDto,
  PlayerDto,
  SOLO_PLAYER_ID,
} from '../types'
import './GameView.css'

const DRAG_KEY = 'text/plain'
const ALL_CLASSES = ['Fighter', 'Guardian', 'Ranger', 'Thief', 'Wizard', 'Bard']
/** Restrained per-seat color coding (reference: red / purple / blue / gold). */
const SEAT_ACCENTS: Record<string, string> = {
  p1: '#a34038',
  p2: '#6d4a92',
  p3: '#3f6fae',
  p4: '#b98a2e',
}

type SidePreview = { card: CardData; x: number; y: number }
type OppSide = 'top' | 'left' | 'right'

export default function GameView() {
  const game = useGameState()
  const [preview, setPreview] = useState<SidePreview | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const me = game.snapshot?.players.find((p) => p.id === SOLO_PLAYER_ID)
  const party = game.snapshot?.parties.find(
    (p) => p.playerId === SOLO_PLAYER_ID,
  )

  if (!game.connected) {
    return (
      <BoardFrame>
        <div className="board board-message">Connecting to server…</div>
      </BoardFrame>
    )
  }
  if (!game.snapshot || !me || !party) {
    return (
      <BoardFrame>
        <div className="board board-message">Waiting for game state…</div>
      </BoardFrame>
    )
  }

  const snapshot = game.snapshot
  const cardOf = (id: string): CardData | undefined => game.cards[id]
  const isMyTurn = snapshot.currentPlayerId === SOLO_PLAYER_ID
  const windowOpen = !!snapshot.modifierWindow
  const canAct = isMyTurn && !windowOpen
  const selectedCard = selectedId ? cardOf(selectedId) : undefined

  // --- hover preview for in-play cards ---------------------------------------

  const hoverInPlay = (card: CardData | null, e?: React.MouseEvent) => {
    if (!card || !e) {
      setPreview(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const width = 250
    const onLeftHalf = rect.left + rect.width / 2 < window.innerWidth / 2
    const x = onLeftHalf ? rect.right + 14 : rect.left - width - 14
    const y = Math.max(10, Math.min(window.innerHeight - 370, rect.top - 60))
    setPreview({ card, x, y })
  }

  // --- play helpers (drag-drop + tap-to-play) ---------------------------------

  const playToParty = (cardId: string) => {
    const card = cardOf(cardId)
    if (!card || !canAct) return
    if (card.type === 'Hero') game.playHero(cardId)
    if (card.type === 'Magic') game.playMagic(cardId)
    setSelectedId(null)
  }

  const playItemOnHero = (cardId: string, heroId: string) => {
    const card = cardOf(cardId)
    if (!card || !canAct) return
    if (card.type === 'Item') game.playItem(cardId, heroId)
    setSelectedId(null)
  }

  const isPlayable = (card?: CardData) =>
    !!card &&
    canAct &&
    (card.type === 'Hero' || card.type === 'Magic' || card.type === 'Item')

  const partyIsTarget =
    selectedCard &&
    (selectedCard.type === 'Hero' || selectedCard.type === 'Magic')
  const heroesAreTargets = selectedCard?.type === 'Item'

  const onHandDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData(DRAG_KEY, cardId)
    e.dataTransfer.effectAllowed = 'move'
    setSelectedId(null)
  }

  const allowDrop = (e: React.DragEvent) => e.preventDefault()

  const onPartyDrop = (e: React.DragEvent) => {
    e.preventDefault()
    playToParty(e.dataTransfer.getData(DRAG_KEY))
  }

  const onHeroDrop = (e: React.DragEvent, heroId: string) => {
    e.preventDefault()
    e.stopPropagation()
    playItemOnHero(e.dataTransfer.getData(DRAG_KEY), heroId)
  }

  // --- derived display data ----------------------------------------------------

  const handCount = me.hand.length
  const handMid = (handCount - 1) / 2
  const dipPct = 0.15
  const handDip = Math.round(151 * dipPct)

  const opponents = snapshot.players.filter((p) => p.id !== SOLO_PLAYER_ID)
  const oppSides: OppSide[] = ['top', 'left', 'right']

  const lastRollEvent = [...game.log]
    .reverse()
    .find((e) => e.type === 'DiceRolled')
  const lastRoll = (lastRollEvent?.payload?.baseRoll as number) ?? null

  const slainCount = party.monsterIds.length
  const partyClasses = new Set(
    [party.leaderId, ...party.heroIds]
      .map((id) => cardOf(id)?.heroClass)
      .filter((c): c is string => !!c),
  )

  const currentName =
    snapshot.players.find((p) => p.id === snapshot.currentPlayerId)?.name ?? '…'

  return (
    <BoardFrame>
      <div
        className={`board ${isMyTurn ? 'board-my-turn' : 'board-waiting'}`}
        onClick={() => setSelectedId(null)}
      >
        {/* Opponent territories */}
        {opponents.slice(0, 3).map((opp, i) => {
          const oppParty = snapshot.parties.find(
            (pt) => pt.playerId === opp.id,
          )
          if (!oppParty) return null
          return (
            <OpponentTerritory
              key={opp.id}
              player={opp}
              party={oppParty}
              side={oppSides[i]}
              accent={SEAT_ACCENTS[opp.id] ?? '#777'}
              active={snapshot.currentPlayerId === opp.id}
              cardOf={cardOf}
              onHover={hoverInPlay}
            />
          )
        })}

        {/* Center encounter: three monsters, evenly spaced, dead center */}
        <div className="encounter">
          <div className="tray-label">Monster Cards</div>
          <div className="monster-row">
            {snapshot.monsterPile.map((id) => (
              <Card
                key={id}
                card={cardOf(id)}
                size="lg"
                onClick={
                  canAct && me.actionPoints >= 2
                    ? () => game.attackMonster(id)
                    : undefined
                }
                onHoverChange={hoverInPlay}
                title="Attack (2 AP)"
              />
            ))}
          </div>
        </div>

        {/* Center systems: decks, discard, dice, slain tray — one clean row */}
        <div className="center-row">
          <DeckPile label="Monster Deck" count={snapshot.monsterDeckSize} />
          <DeckPile
            label="Main Deck"
            count={snapshot.mainDeckSize}
            onClick={canAct ? game.drawCard : undefined}
            title="Draw a card (1 AP)"
          />
          <DeckPile
            label="Discard Pile"
            count={snapshot.discardPile.length}
            topCard={
              snapshot.discardPile.length > 0
                ? cardOf(snapshot.discardPile[0])
                : undefined
            }
            onHoverChange={hoverInPlay}
          />
          <div className="dice-tile">
            <div className="dice-tile-die">{lastRoll ?? '–'}</div>
            <div className="dice-tile-caption">
              Roll dice to use hero effects
            </div>
          </div>
          <div className="slain-tray">
            <div className="tray-label">Slayed Monsters</div>
            <div className="slain-tray-row">
              {party.monsterIds.length === 0 && (
                <span className="slain-tray-empty">☠</span>
              )}
              {party.monsterIds.map((id) => (
                <Card
                  key={id}
                  card={cardOf(id)}
                  size="sm"
                  onHoverChange={hoverInPlay}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Local territory */}
        <div
          className={`territory t-bottom ${isMyTurn ? 'territory-active' : ''}`}
          style={{ '--accent': SEAT_ACCENTS.p1 } as React.CSSProperties}
        >
          <div className="leader-slot">
            <div className="tray-label">Party Leader</div>
            <Card
              card={cardOf(party.leaderId)}
              size="md"
              onHoverChange={hoverInPlay}
            />
          </div>
          <div
            className={`tray hero-tray ${partyIsTarget ? 'zone-target' : ''}`}
            onDragOver={allowDrop}
            onDrop={onPartyDrop}
            onClick={(e) => {
              if (selectedId && partyIsTarget) {
                e.stopPropagation()
                playToParty(selectedId)
              }
            }}
          >
            <div className="tray-label">Heros in Party</div>
            <div className="hero-row">
              {party.heroIds.length === 0 && (
                <div className="hero-hint">Play a hero from your hand</div>
              )}
              {party.heroIds.map((id) => {
                const used = snapshot.abilitiesUsedThisTurn.includes(id)
                const equipped = party.equipped[id]
                return (
                  <div className="hero-slot" key={id}>
                    <Card
                      card={cardOf(id)}
                      size="sm"
                      exhausted={used}
                      glowing={heroesAreTargets}
                      onClick={
                        heroesAreTargets && selectedId
                          ? () => playItemOnHero(selectedId, id)
                          : canAct && !used
                            ? () => game.rollOnHero(id)
                            : undefined
                      }
                      onDragOver={allowDrop}
                      onDrop={(e) => onHeroDrop(e, id)}
                      onHoverChange={hoverInPlay}
                      title={
                        heroesAreTargets
                          ? 'Equip item here'
                          : used
                            ? 'Ability already used this turn'
                            : 'Roll (1 AP)'
                      }
                    />
                    {equipped && (
                      <div className="equipped-tuck">
                        <Card
                          card={cardOf(equipped)}
                          size="xs"
                          onHoverChange={hoverInPlay}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Local hand fan along the bottom edge */}
        <div
          className="hand-arc"
          style={
            { bottom: -handDip, '--dip': `${handDip}px` } as React.CSSProperties
          }
        >
          {me.hand.map((id, i) => {
            const card = cardOf(id)
            const off = i - handMid
            const rot = off * Math.min(42 / Math.max(handCount, 1), 6)
            const sink = Math.pow(Math.abs(off), 1.6) * 7
            const playable = isPlayable(card)
            const style = {
              zIndex: 10 + i,
              '--rot': `${rot}deg`,
              '--sink': `${sink}px`,
            } as React.CSSProperties
            return (
              <div
                key={id}
                className={`hand-slot ${selectedId === id ? 'selected' : ''}`}
                style={style}
                draggable={playable}
                onDragStart={(e) => onHandDragStart(e, id)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!playable) return
                  setSelectedId(selectedId === id ? null : id)
                }}
              >
                <div className="hand-card">
                  <Card card={card} glowing={playable} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Top-right HUD: action points, turn banner, end turn */}
        <div className="hud-corner">
          <ActionPointDisplay
            current={me.actionPoints}
            max={me.actionPointsPerTurn}
          />
          <div className={`turn-banner ${isMyTurn ? 'turn-banner-mine' : ''}`}>
            {isMyTurn ? 'Your Turn' : `${currentName}'s Turn`}
          </div>
          <button className="end-turn" disabled={!canAct} onClick={game.endTurn}>
            End Turn
          </button>
          <button className="restart" onClick={game.startGame}>
            ↻ New game
          </button>
        </div>

        {/* Bottom-right: win-condition progress */}
        <div className="game-info">
          <div className="game-info-title">Game Info</div>
          <div className={`gi-row ${slainCount >= 3 ? 'gi-done' : ''}`}>
            <span className="gi-check">{slainCount >= 3 ? '☑' : '☐'}</span>
            Slay 3 monsters
            <span className="gi-progress">{Math.min(slainCount, 3)} / 3</span>
          </div>
          <div className="gi-or">or</div>
          <div className={`gi-row ${partyClasses.size >= 6 ? 'gi-done' : ''}`}>
            <span className="gi-check">{partyClasses.size >= 6 ? '☑' : '☐'}</span>
            Assemble 6 classes
            <span className="gi-progress">{partyClasses.size} / 6</span>
          </div>
          <div className="gi-classes">
            {ALL_CLASSES.map((c) => (
              <span
                key={c}
                title={c}
                className={`gi-class ${partyClasses.has(c) ? 'gi-class-have' : ''}`}
              >
                {c[0]}
              </span>
            ))}
          </div>
        </div>

        {preview && (
          <div
            className="side-preview"
            style={{
              left: preview.x,
              top: preview.y,
              backgroundImage: `url(${cardTemplate(preview.card.type)})`,
            }}
          />
        )}

        {snapshot.modifierWindow && (
          <DiceRoller
            window={snapshot.modifierWindow}
            hand={me.hand}
            cardOf={cardOf}
            onPlay={game.playModifier}
            onSkip={game.skipWindow}
          />
        )}

        <BoardToast log={game.log} cardOf={cardOf} />
        <EventLog log={game.log} cardOf={cardOf} />
      </div>
    </BoardFrame>
  )
}

// ---------------------------------------------------------------------------
// Opponent territory: leader slot + hero row tray + hand stack, framed and
// color-coded, arranged per board side (reference composition).
// ---------------------------------------------------------------------------

function OpponentTerritory(props: {
  player: PlayerDto
  party: PartyDto
  side: OppSide
  accent: string
  active: boolean
  cardOf: (id: string) => CardData | undefined
  onHover: (card: CardData | null, e?: React.MouseEvent) => void
}) {
  const { player, party, side } = props
  return (
    <div
      className={`territory t-${side} ${props.active ? 'territory-active' : ''}`}
      style={{ '--accent': props.accent } as React.CSSProperties}
    >
      <div className="territory-banner">{player.name}</div>
      <div className="leader-slot">
        <div className="tray-label">Party Leader</div>
        <Card
          card={props.cardOf(party.leaderId)}
          size="sm"
          onHoverChange={props.onHover}
        />
      </div>
      <div className="tray hero-tray">
        <div className="tray-label">
          Heros in Party
          {party.monsterIds.length > 0 && (
            <span className="slain-chip">🏆 {party.monsterIds.length}</span>
          )}
        </div>
        <div className="hero-row">
          {party.heroIds.length === 0 && <div className="hero-hint">—</div>}
          {party.heroIds.map((id) => {
            const equipped = party.equipped[id]
            return (
              <div className="hero-slot" key={id}>
                <Card
                  card={props.cardOf(id)}
                  size="xs"
                  onHoverChange={props.onHover}
                />
                {equipped && (
                  <div className="equipped-tuck">
                    <Card
                      card={props.cardOf(equipped)}
                      size="xs"
                      onHoverChange={props.onHover}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="hand-stack">
        <div className="tray-label">Hand</div>
        <Card faceDown size="sm" />
        <div className="pile-badge">{player.hand.length}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast + event log
// ---------------------------------------------------------------------------

function BoardToast(props: {
  log: GameEventDto[]
  cardOf: (id: string) => CardData | undefined
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
      const name = cardId ? props.cardOf(cardId)?.name ?? '' : ''
      let text: string | null = null
      let bad = false
      if (e.type === 'MonsterSlain') text = `🏆 ${name} slain!`
      if (e.type === 'MonsterAttackFail') {
        text = `💥 ${name} fights back!`
        bad = true
      }
      if (e.type === 'RollSuccess') text = `✨ ${name}'s ability triggers!`
      if (text) setToast({ text, bad, key: Date.now() + i })
    }
    seenRef.current = props.log.length
  }, [props.log, props.cardOf])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null
  return (
    <div
      key={toast.key}
      className={`board-toast ${toast.bad ? 'board-toast-bad' : ''}`}
    >
      {toast.text}
    </div>
  )
}

function EventLog(props: {
  log: GameEventDto[]
  cardOf: (id: string) => CardData | undefined
}) {
  const entries = useMemo(
    () =>
      props.log
        .map((e, i) => ({ key: i, text: describeEvent(e, props.cardOf) }))
        .filter((e) => e.text)
        .slice(-7),
    [props.log, props.cardOf],
  )
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  if (entries.length === 0) return null

  return (
    <div className="event-log">
      {entries.map((e) => (
        <div key={e.key} className="event-line">
          {e.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function describeEvent(
  e: GameEventDto,
  cardOf: (id: string) => CardData | undefined,
): string | null {
  const cardId = e.payload?.cardId as string | undefined
  const name = cardId ? cardOf(cardId)?.name ?? cardId : ''
  switch (e.type) {
    case 'CardDrawn':
      return `Drew ${name}`
    case 'HeroAddedToParty':
      return `${name} joined the party`
    case 'ItemEquippedToHero':
      return `Equipped ${name}`
    case 'DiceRolled':
      return `Rolled a ${(e.payload?.baseRoll as number) ?? '?'}`
    case 'ModifierApplied':
      return `Modifier played → roll is now ${e.payload?.finalRoll}`
    case 'ModifierWindowClosed':
      return `Roll settled at ${e.payload?.finalRoll}`
    case 'RollSuccess':
      return `${name}'s ability triggers!`
    case 'MonsterSlain':
      return `🏆 Slew ${name}!`
    case 'MonsterAttackFail':
      return `💥 ${name} fights back!`
    case 'CardDiscarded':
      return `Discarded ${name}`
    case 'HeroDestroyed':
      return `${name} was destroyed`
    case 'TurnStarted':
      return `— Turn start —`
    default:
      return null
  }
}
