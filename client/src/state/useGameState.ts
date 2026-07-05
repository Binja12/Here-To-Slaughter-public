import { useCallback, useEffect, useMemo, useState } from 'react'
import { socket } from '../socket/socket'
import {
  ActionDto,
  CardData,
  GameEventDto,
  GameSnapshot,
  ModifierReactionDto,
} from '../types'

const LOG_LIMIT = 60

export type GameApi = {
  connected: boolean
  snapshot: GameSnapshot | null
  cards: Record<string, CardData>
  log: GameEventDto[]
  startGame: () => void
  drawCard: () => void
  playHero: (cardId: string) => void
  playItem: (cardId: string, targetHeroId: string) => void
  playMagic: (cardId: string) => void
  rollOnHero: (cardId: string) => void
  attackMonster: (cardId: string) => void
  playModifier: (dto: ModifierReactionDto) => void
  skipWindow: () => void
  endTurn: () => void
}

export function useGameState(): GameApi {
  const [connected, setConnected] = useState(socket.connected)
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [cards, setCards] = useState<Record<string, CardData>>({})
  const [log, setLog] = useState<GameEventDto[]>([])

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onState = (state: GameSnapshot) => setSnapshot(state)
    const onCatalog = (catalog: CardData[]) => {
      const byId: Record<string, CardData> = {}
      for (const card of catalog) byId[card.id] = card
      setCards(byId)
    }
    const onEvent = (event: GameEventDto) =>
      setLog((prev) => {
        // Engine quirk: cardRemovedFromHand mis-emits HeroAddedToParty, so
        // hero plays arrive twice — drop consecutive identical events.
        // (Remove once game-event-factory.ts is fixed server-side.)
        const last = prev[prev.length - 1]
        if (
          last &&
          last.type === event.type &&
          last.playerId === event.playerId &&
          JSON.stringify(last.payload) === JSON.stringify(event.payload)
        ) {
          return prev
        }
        return [...prev.slice(-(LOG_LIMIT - 1)), event]
      })

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('game:state', onState)
    socket.on('game:catalog', onCatalog)
    socket.on('game:event', onEvent)

    // The socket survives hot reloads while component state does not — ask the
    // server to resend catalog + snapshot whenever the hook (re)mounts.
    if (socket.connected) socket.emit('game:sync')

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('game:state', onState)
      socket.off('game:catalog', onCatalog)
      socket.off('game:event', onEvent)
    }
  }, [])

  const sendAction = useCallback((dto: ActionDto) => {
    socket.emit('game:action', dto)
  }, [])

  return useMemo(
    () => ({
      connected,
      snapshot,
      cards,
      log,
      startGame: () => {
        setLog([])
        socket.emit('game:start')
      },
      drawCard: () => sendAction({ type: 'DrawCard' }),
      playHero: (cardId) => sendAction({ type: 'PlayHero', cardId }),
      playItem: (cardId, targetHeroId) =>
        sendAction({ type: 'PlayItem', cardId, targetHeroId }),
      playMagic: (cardId) => sendAction({ type: 'PlayMagic', cardId }),
      rollOnHero: (cardId) => sendAction({ type: 'RollOnHero', cardId }),
      attackMonster: (cardId) => sendAction({ type: 'AttackMonster', cardId }),
      playModifier: (dto) => socket.emit('game:reaction', dto),
      skipWindow: () => socket.emit('game:skip'),
      endTurn: () => socket.emit('game:endTurn'),
    }),
    [connected, snapshot, cards, log, sendAction],
  )
}
