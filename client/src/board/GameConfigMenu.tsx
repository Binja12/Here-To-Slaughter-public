import React from 'react'
import { GameConfigView } from '../contract/views'

export default function GameConfigMenu({ config }: { config?: GameConfigView }) {
  if (!config) return null
  const wins = config.winConditions.map((condition) => condition.type === 'SlayMonsters'
    ? `Slay ${condition.value} monsters` : `${condition.value} different hero classes`)
  return (
    <details className="max-w-xs rounded-lg border border-amber-700/70 bg-zinc-950/95 text-sm text-amber-100 shadow-xl">
      <summary className="cursor-pointer px-3 py-2 font-heading">Game settings</summary>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-amber-900 px-3 py-3">
        <dt>Win by</dt><dd>{wins.join(config.requireAllWinConditions ? ' AND ' : ' OR ')}</dd>
        <dt>Turn timer</dt><dd>{config.turnTimeMs === undefined ? 'Unlimited' : `${config.turnTimeMs / 1000}s`}</dd>
        <dt>Reaction timer</dt><dd>{config.reactionTimeMs / 1000}s</dd>
        <dt>Action points</dt><dd>{config.actionPointsPerTurn} per turn</dd>
        <dt>Seamless mode</dt><dd>{config.seamlessReactions ? 'On' : 'Off'}</dd>
        <dt>Card sets</dt><dd>{config.cardSets.join(', ')}</dd>
      </dl>
    </details>
  )
}
