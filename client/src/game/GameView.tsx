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

/** Floating enlarged preview shown beside a hovered in-play card. */
type SidePreview = { card: CardData; x: number; y: number }

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
    const y = Math.max(
      10,
      Math.min(window.innerHeight - 370, rect.top - 60),
    )
    setPreview({ card, x, y })
  }

  // --- play helpers (shared by drag-drop and tap-to-play) ---------------------

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

  // Zones glow when the selected/tapped card can be played there.
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

  // --- hand arc ----------------------------------------------------------------

  const handCount = me.hand.length
  const handMid = (handCount - 1) / 2
  // Cards sit low, partly outside the screen, so the player "holds" them in
  // hand — 15% of the card below the screen edge (user-tuned).
  const dipPct = 0.15
  const handDip = Math.round(151 * dipPct)

  // Slain monsters flank the leader alternating left, right, left, right…
  // Newest sits closest to the leader and pushes older ones outward.
  const slainLeft = party.monsterIds.filter((_, i) => i % 2 === 0)
  const slainRight = party.monsterIds.filter((_, i) => i % 2 === 1)

  const opponents = snapshot.players.filter((p) => p.id !== SOLO_PLAYER_ID)
  const oppPositions: OppPosition[] = ['top', 'left', 'right']

  return (
    <BoardFrame>
    <div
      className={`board ${isMyTurn ? 'board-my-turn' : 'board-waiting'}`}
      onClick={() => setSelectedId(null)}
    >
      <button className="restart" onClick={game.startGame}>
        ↻ New game
      </button>

      {opponents.slice(0, 3).map((opp, i) => {
        const oppParty = snapshot.parties.find((pt) => pt.playerId === opp.id)
        if (!oppParty) return null
        return (
          <OpponentZone
            key={opp.id}
            player={opp}
            party={oppParty}
            position={oppPositions[i]}
            active={snapshot.currentPlayerId === opp.id}
            cardOf={cardOf}
            onHover={hoverInPlay}
          />
        )
      })}

      {/* Battlefield: monsters (with monster deck beside them), then heroes */}
      <div className="battlefield">
        <div className="monster-line">
          <div className="monster-row">
            {snapshot.monsterPile.map((id) => (
              <Card
                key={id}
                card={cardOf(id)}
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
          <div className="monster-deck">
            <DeckPile label="Monsters" count={snapshot.monsterDeckSize} />
          </div>
        </div>

        <div
          className={`hero-line ${partyIsTarget ? 'zone-target' : ''}`}
          onDragOver={allowDrop}
          onDrop={onPartyDrop}
          onClick={(e) => {
            if (selectedId && partyIsTarget) {
              e.stopPropagation()
              playToParty(selectedId)
            }
          }}
        >
          {party.heroIds.map((id) => {
            const used = snapshot.abilitiesUsedThisTurn.includes(id)
            const equippedItem = party.equipped[id]
            return (
              <div className="hero-slot" key={id}>
                <div
                  className={[
                    'portrait',
                    'portrait-hero',
                    used ? 'portrait-exhausted' : '',
                    heroesAreTargets ? 'portrait-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ backgroundImage: `url(${cardTemplate('Hero')})` }}
                  onClick={
                    heroesAreTargets && selectedId
                      ? () => playItemOnHero(selectedId, id)
                      : canAct && !used
                        ? () => game.rollOnHero(id)
                        : undefined
                  }
                  onDragOver={allowDrop}
                  onDrop={(e) => onHeroDrop(e, id)}
                  onMouseEnter={(e) => {
                    const hero = cardOf(id)
                    if (hero) hoverInPlay(hero, e)
                  }}
                  onMouseLeave={() => hoverInPlay(null)}
                  title={
                    heroesAreTargets
                      ? 'Equip item here'
                      : used
                        ? 'Ability already used this turn'
                        : 'Roll (1 AP)'
                  }
                />
                {equippedItem && (
                  <div className="equipped-item">
                    <Card
                      card={cardOf(equippedItem)}
                      size="sm"
                      onHoverChange={hoverInPlay}
                    />
                  </div>
                )}
              </div>
            )
          })}
          {party.heroIds.length === 0 && (
            <div className="hero-hint">Play a Hero from your hand</div>
          )}
        </div>
      </div>

      {/* Bottom band: discard | leader + slain ("portrait") | hand arc | deck */}
      <div className="discard-corner">
        <DeckPile
          label="Discard"
          count={snapshot.discardPile.length}
          topCard={
            snapshot.discardPile.length > 0
              ? cardOf(snapshot.discardPile[0])
              : undefined
          }
          onHoverChange={hoverInPlay}
        />
      </div>

      <div className="portrait-zone">
        <div className="slain-side slain-left" title="Slain monsters">
          {slainLeft.map((id, i, arr) => {
            // Oldest first (outermost); later siblings paint on top → newest
            // (nearest the leader) covers the older ones. Fanned like the hand
            // arc: tilting and sinking the further out they sit.
            const dist = arr.length - 1 - i
            return (
              <div
                key={id}
                className="slain-card"
                style={{
                  transform: `rotate(${-(6 + dist * 8)}deg) translateY(${6 + dist * 10}px)`,
                }}
              >
                <Card card={cardOf(id)} size="sm" onHoverChange={hoverInPlay} />
              </div>
            )
          })}
        </div>
        <div
          className="portrait portrait-leader"
          style={{ backgroundImage: `url(${cardTemplate('Leader')})` }}
          title="Party leader"
          onMouseEnter={(e) => {
            const leader = cardOf(party.leaderId)
            if (leader) hoverInPlay(leader, e)
          }}
          onMouseLeave={() => hoverInPlay(null)}
        />
        <div className="slain-side slain-right" title="Slain monsters">
          {[...slainRight].reverse().map((id, i, arr) => (
            // Newest renders first (adjacent to the leader); explicit z-index
            // keeps it on top because painting order runs outward on this side.
            <div
              key={id}
              className="slain-card"
              style={{
                zIndex: arr.length - i,
                transform: `rotate(${6 + i * 8}deg) translateY(${6 + i * 10}px)`,
              }}
            >
              <Card card={cardOf(id)} size="sm" onHoverChange={hoverInPlay} />
            </div>
          ))}
        </div>
      </div>

      <div
        className="hand-arc"
        style={{ bottom: -handDip, '--dip': `${handDip}px` } as React.CSSProperties}
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

      <div className="deck-corner">
        <ActionPointDisplay
          current={me.actionPoints}
          max={me.actionPointsPerTurn}
        />
        <DeckPile
          label="Deck"
          count={snapshot.mainDeckSize}
          onClick={canAct ? game.drawCard : undefined}
          title="Draw a card (1 AP)"
        />
      </div>

      <div className="turn-corner">
        <div className={`turn-pill ${isMyTurn ? 'turn-active' : ''}`}>
          {isMyTurn
            ? 'Your turn'
            : `${
                snapshot.players.find(
                  (p) => p.id === snapshot.currentPlayerId,
                )?.name ?? '…'
              }'s turn`}
        </div>
        <button className="end-turn" disabled={!canAct} onClick={game.endTurn}>
          End Turn
        </button>
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
// Pieces
// ---------------------------------------------------------------------------

type OppPosition = 'top' | 'left' | 'right'

/**
 * One opponent seat: card-back hand fan anchored to their screen edge,
 * leader portrait (biggest piece), slain-monster fans flanking it and hero
 * portraits — all oriented toward the board center.
 */
function OpponentZone(props: {
  player: PlayerDto
  party: PartyDto
  position: OppPosition
  active: boolean
  cardOf: (id: string) => CardData | undefined
  onHover: (card: CardData | null, e?: React.MouseEvent) => void
}) {
  const { player, party, position } = props
  const n = player.hand.length
  const mid = (n - 1) / 2
  const slainA = party.monsterIds.filter((_, i) => i % 2 === 0)
  const slainB = party.monsterIds.filter((_, i) => i % 2 === 1)

  // Fan math mirrors the local hand, re-oriented per edge: top hangs down
  // (reversed arc), sides point their cards toward the board.
  const handTransform = (off: number, sink: number): string => {
    if (position === 'top') return `rotate(${-off * 5}deg) translateY(${-sink}px)`
    if (position === 'left') return `rotate(${90 + off * 5}deg) translateY(${-sink}px)`
    return `rotate(${-90 - off * 5}deg) translateY(${-sink}px)`
  }

  const hoverCard = (id: string) => (e: React.MouseEvent) => {
    const card = props.cardOf(id)
    if (card) props.onHover(card, e)
  }

  // The slain fan mirrors the owner's hand fan: the top player's opens
  // downward (reversed), side players' open toward the bottom like the local one.
  const vFlip = position === 'top' ? -1 : 1

  return (
    <div className={`opp-zone opp-${position}`}>
      <div className="opp-hand">
        {player.hand.map((_, i) => {
          const off = i - mid
          const sink = Math.pow(Math.abs(off), 1.6) * 5
          return (
            <div
              key={i}
              className="opp-hand-slot"
              style={{ zIndex: i, transform: handTransform(off, sink) }}
            >
              <Card faceDown size="xs" />
            </div>
          )
        })}
      </div>

      <div className="opp-inner">
        <div className="opp-board">
          <div className="opp-slain">
            {slainA.map((id, i, arr) => {
              const d = arr.length - 1 - i
              return (
                <div
                  key={id}
                  className="opp-slain-card"
                  style={{
                    transform: `rotate(${vFlip * -(6 + d * 8)}deg) translateY(${vFlip * (4 + d * 8)}px)`,
                  }}
                >
                  <Card card={props.cardOf(id)} size="xs" onHoverChange={props.onHover} />
                </div>
              )
            })}
          </div>
          <div
            className={`portrait portrait-opp ${props.active ? 'portrait-active' : ''}`}
            style={{ backgroundImage: `url(${cardTemplate('Leader')})` }}
            onMouseEnter={hoverCard(party.leaderId)}
            onMouseLeave={() => props.onHover(null)}
            title={player.name}
          />
          <div className="opp-slain">
            {[...slainB].reverse().map((id, i, arr) => (
              <div
                key={id}
                className="opp-slain-card"
                style={{
                  zIndex: arr.length - i,
                  transform: `rotate(${vFlip * (6 + i * 8)}deg) translateY(${vFlip * (4 + i * 8)}px)`,
                }}
              >
                <Card card={props.cardOf(id)} size="xs" onHoverChange={props.onHover} />
              </div>
            ))}
          </div>
        </div>

        <div className="opp-heroes">
          {party.heroIds.map((id) => (
            <div
              key={id}
              className="portrait portrait-hero portrait-hero-sm"
              style={{ backgroundImage: `url(${cardTemplate('Hero')})` }}
              onMouseEnter={hoverCard(id)}
              onMouseLeave={() => props.onHover(null)}
            />
          ))}
        </div>

        <div className="opp-name">{player.name}</div>
      </div>
    </div>
  )
}

/** Brief center-screen banner for dramatic moments (slain, fight back, abilities). */
function BoardToast(props: {
  log: GameEventDto[]
  cardOf: (id: string) => CardData | undefined
}) {
  const [toast, setToast] = useState<{ text: string; bad: boolean; key: number } | null>(null)
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
    <div key={toast.key} className={`board-toast ${toast.bad ? 'board-toast-bad' : ''}`}>
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
        .slice(-8),
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
