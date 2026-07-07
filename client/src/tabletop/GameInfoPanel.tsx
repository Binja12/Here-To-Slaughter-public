import React from 'react'
import ClassIconRow from './ClassIconRow'

// Bottom-right framed objectives panel: the two win paths with live progress.

type GameInfoPanelProps = {
  slainCount: number
  slainTarget: number
  ownedClasses: Set<string>
  classTarget: number
}

export default function GameInfoPanel({
  slainCount,
  slainTarget,
  ownedClasses,
  classTarget,
}: GameInfoPanelProps) {
  const slayDone = slainCount >= slainTarget
  const classDone = ownedClasses.size >= classTarget
  return (
    <section className="panel game-info" aria-label="Win conditions">
      <h2 className="panel-title">Game Info</h2>
      <div className={`gi-row ${slayDone ? 'gi-done' : ''}`}>
        <span className="gi-check" aria-hidden="true">
          {slayDone ? '☑' : '☐'}
        </span>
        <span className="gi-goal">Slay {slainTarget} monsters</span>
        <span className="gi-progress">
          {Math.min(slainCount, slainTarget)} / {slainTarget}
        </span>
      </div>
      <div className="gi-or" aria-hidden="true">
        — or —
      </div>
      <div className={`gi-row ${classDone ? 'gi-done' : ''}`}>
        <span className="gi-check" aria-hidden="true">
          {classDone ? '☑' : '☐'}
        </span>
        <span className="gi-goal">Assemble {classTarget} different classes</span>
        <span className="gi-progress">
          {Math.min(ownedClasses.size, classTarget)} / {classTarget}
        </span>
      </div>
      <ClassIconRow owned={ownedClasses} />
    </section>
  )
}
