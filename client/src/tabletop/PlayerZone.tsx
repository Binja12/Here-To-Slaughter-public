import React from 'react'
import { CardData, PartyDto } from '../types'
import { Seat } from './model'
import CardFrame from './cards/CardFrame'
import HeroCard from './cards/HeroCard'
import PartyLeaderCard from './cards/PartyLeaderCard'
import { TrophyIcon } from './icons'
import Tooltip from './Tooltip'

// One edge of the table. Presentational for every seat; the bottom (local)
// seat additionally receives selection/drag callbacks from GameTable.

export type ZoneInteractions = {
  selectedId: string | null
  /** an Item card is selected, so party heroes become equip targets */
  heroesAreTargets: boolean
  /** a Hero/Magic card is selected, so the party tray is a drop target */
  partyIsTarget: boolean
  usedAbilities: string[]
  onSelectHero: (heroId: string) => void
  onEquipToHero: (heroId: string) => void
  onDropOnParty: (e: React.DragEvent) => void
  onDropOnHero: (e: React.DragEvent, heroId: string) => void
  allowDrop: (e: React.DragEvent) => void
}

type PlayerZoneProps = {
  seat: Seat
  accent: string
  active: boolean
  isLocal: boolean
  cardOf: (id: string) => CardData | undefined
  onInspect: (card: CardData | null, e?: React.SyntheticEvent) => void
  interactions?: ZoneInteractions
  /** extra zone content — the local seat renders its face-up hand here */
  children?: React.ReactNode
}

function SlainChip({ party }: { party: PartyDto }) {
  if (party.monsterIds.length === 0) return null
  return (
    <Tooltip text={`${party.monsterIds.length} monster${party.monsterIds.length > 1 ? 's' : ''} slain`}>
      <span className="slain-chip" aria-label={`${party.monsterIds.length} monsters slain`}>
        <TrophyIcon size={13} color="#e8c56a" /> {party.monsterIds.length}
      </span>
    </Tooltip>
  )
}

export default function PlayerZone({
  seat,
  accent,
  active,
  isLocal,
  cardOf,
  onInspect,
  interactions,
  children,
}: PlayerZoneProps) {
  const { side, player, party } = seat

  if (!player || !party) {
    return (
      <div className={`zone zone-${side} zone-empty`} aria-label="Empty seat">
        <span className="zone-empty-label">Open Seat</span>
        <div className="zone-empty-outline" />
      </div>
    )
  }

  const heroSize = side === 'top' || side === 'bottom' ? 'sm' : 'xs'
  const ix = interactions

  return (
    <div
      className={`zone zone-${side} ${active ? 'zone-active' : 'zone-idle'}`}
      style={{ '--accent': accent } as React.CSSProperties}
      aria-label={`${player.name}${isLocal ? ' (you)' : ''}${active ? ' — current turn' : ''}`}
    >
      <div className="zone-plaque">
        <span className="zone-plaque-text">{player.name}</span>
        {active && <span className="zone-plaque-turn">● turn</span>}
      </div>

      <div className="zone-body">
        <PartyLeaderCard
          card={cardOf(party.leaderId)}
          size={side === 'bottom' ? 'md' : 'sm'}
          onInspect={onInspect}
        />

        <div
          className={`party-tray ${ix?.partyIsTarget ? 'tray-target' : ''}`}
          onDragOver={ix?.partyIsTarget ? ix.allowDrop : undefined}
          onDrop={ix?.partyIsTarget ? ix.onDropOnParty : undefined}
        >
          <span className="zone-caption">
            Heroes in Party
            <SlainChip party={party} />
          </span>
          <div className="party-row">
            {party.heroIds.length === 0 && (
              <div className="party-empty-slot" aria-hidden="true" />
            )}
            {party.heroIds.map((id) => {
              const used = ix?.usedAbilities.includes(id) ?? false
              const equipped = party.equipped[id]
              return (
                <HeroCard
                  key={id}
                  card={cardOf(id)}
                  size={heroSize}
                  equippedItem={equipped ? cardOf(equipped) : undefined}
                  usedThisTurn={isLocal && used}
                  selected={ix?.selectedId === id}
                  highlight={ix?.heroesAreTargets ? 'target' : 'none'}
                  onInspect={onInspect}
                  onActivate={
                    ix
                      ? () =>
                          ix.heroesAreTargets
                            ? ix.onEquipToHero(id)
                            : ix.onSelectHero(id)
                      : undefined
                  }
                  onDragOver={ix ? ix.allowDrop : undefined}
                  onDrop={ix ? (e) => ix.onDropOnHero(e, id) : undefined}
                />
              )
            })}
          </div>
        </div>

        {children}

        {!isLocal && (
          <div className="hand-stack">
            <span className="zone-caption">Hand</span>
            <div className={`stack-pile ${player.hand.length > 2 ? 'stack-depth-2' : 'stack-depth-1'}`}>
              <CardFrame faceDown size="sm" ariaLabel={`${player.name}'s hand`} />
              <span className="stack-count" aria-hidden="true">
                {player.hand.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
