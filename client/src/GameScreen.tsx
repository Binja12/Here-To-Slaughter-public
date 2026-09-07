import React, { useEffect, useMemo } from 'react'
import Board from './board/Board'
import { AudioProvider } from './audio/AudioProvider'
import type { GameAssigned } from './contract'
import { FakeGamePort } from './ports/FakeGamePort'
import { RealGamePort } from './ports/RealGamePort'
import { CommandProvider } from './state/commands'
import { GameProvider } from './state/game'
import { useGameState } from './state/useGameState'
import { backgroundTraffic } from './loading/traffic'
import { useAssetWarmup } from './loading/warmup'
import PendingCommandNotice from './loading/PendingCommandNotice'

export default function GameScreen({ assignment, onLeave }: { assignment: GameAssigned; onLeave: () => void }) {
  const port = useMemo(() => process.env.REACT_APP_FAKE_SERVER === '1' ? new FakeGamePort() : new RealGamePort(), [])
  const game = useGameState(port, assignment)
  const ready = !!game.snapshot
  useAssetWarmup(ready ? 'game' : 'game-connecting')
  useEffect(() => {
    if (!ready) return
    performance.mark?.('htsr:board-visible')
    let measured = false
    const measure = () => {
      if (measured || backgroundTraffic.busy) return
      measured = true
      performance.mark?.('htsr:board-ready')
    }
    const unsubscribe = backgroundTraffic.onIdle(measure)
    const frame = requestAnimationFrame(measure)
    return () => { cancelAnimationFrame(frame); unsubscribe() }
  }, [ready])
  if (!game.snapshot) return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 font-heading text-xl text-amber-200">
      {game.connected ? 'Waiting for the table…' : 'Connecting to the table…'}
    </main>
  )
  return <><CommandProvider send={game.send}>
    <GameProvider view={game.snapshot.state} info={game.info} log={game.snapshot.log}>
      <AudioProvider><Board onLeave={onLeave} /></AudioProvider>
    </GameProvider>
  </CommandProvider>
    {game.connected && <PendingCommandNotice since={game.pendingSince ?? null} />}
    {!game.connected && <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[500] border-b border-red-400 bg-red-950/95 px-4 py-3 text-center text-sm text-white">
      Connection to the game was lost. Trying to reconnect… Game actions are unavailable until it reconnects.
    </div>}
  </>
}
