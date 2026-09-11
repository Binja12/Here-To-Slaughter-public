import React from 'react'
import { GameLogEntry } from '../contract/views'

/** The table's story, newest first, in a dropdown under the settings menu. */
export default function GameLogMenu({ entries }: { entries: GameLogEntry[] }) {
  return (
    <details className="max-w-xs rounded-lg border border-amber-700/70 bg-zinc-950/95 text-sm text-amber-100 shadow-xl">
      <summary className="cursor-pointer px-3 py-2 font-heading">Game log</summary>
      <ol
        className="max-h-[50vh] w-80 overflow-y-auto border-t border-amber-900 px-3 py-2"
        aria-label="Game log"
      >
        {entries.length === 0 && (
          <li className="py-1 text-amber-100/60">Nothing has happened yet</li>
        )}
        {[...entries].reverse().map((entry) => (
          <li key={entry.seq} className="flex gap-2 py-1 leading-snug">
            <time className="shrink-0 tabular-nums text-amber-100/50">{clock(entry.at)}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function clock(epochMs: number): string {
  const date = new Date(epochMs)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}
