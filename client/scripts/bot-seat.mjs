#!/usr/bin/env node
// ---------------------------------------------------------------------------
// A headless seat for local playtests: registers, readies, joins the game it
// is assigned to and plays a dumb but legal game (play a hero if it can,
// answer every choice with its first option, otherwise end the turn). Two of
// these plus one browser make a three-seat table on one machine, which is
// otherwise three cookie jars.
//
//   node scripts/bot-seat.mjs alice
//   node scripts/bot-seat.mjs bob --lobby http://localhost:3000
//   node scripts/bot-seat.mjs host --host 3      # readies first and starts at 3
//
// A bot without --host waits for somebody else to be ready before it
// readies, so the browser stays the host. Sessions live in the lobby's
// memory: restart the lobby and the bot re-registers on its next run.
// Talks the same contract as client/src/ports/Real*Port.ts, nothing else.
// ---------------------------------------------------------------------------
import { randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'

const args = process.argv.slice(2)
const positional = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'))
const username = positional[0] ?? `bot-${Math.random().toString(36).slice(2, 6)}`
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const LOBBY = option('lobby', process.env.LOBBY_URL ?? 'http://localhost:3000')
const PASSWORD = option('password', 'slaughter')
const HOST_AT = Number(option('host', '0'))
/** The other bots' usernames (`--peers a,b,c`): a bot readies only once a
 *  NON-bot is ready, so bots never fill a table by themselves and never end
 *  up host. */
const PEERS = new Set(option('peers', 'alice,bob,carol').split(',').map((s) => s.trim()))
const THINK_MS = Number(option('think', '800'))

const log = (...message) => console.log(new Date().toISOString().slice(11, 19), `[${username}]`, ...message)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let cookie = ''

async function call(path, method = 'GET', body) {
  const response = await fetch(LOBBY + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const session = (response.headers.getSetCookie?.() ?? []).find((entry) =>
    entry.startsWith('htsr_session='),
  )
  if (session) cookie = session.split(';')[0]
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ reason: response.statusText }))
    throw new Error(`${method} ${path} -> ${response.status} ${failure.reason}`)
  }
  return response.status === 204 ? undefined : response.json()
}

async function authenticate() {
  try {
    return await call('/register', 'POST', { username, password: PASSWORD })
  } catch (error) {
    log('register refused, logging in instead:', error.message)
    return call('/login', 'POST', { username, password: PASSWORD })
  }
}

/** The lobby's SSE stream as `{ event, data }` objects. */
async function* events(path) {
  const response = await fetch(LOBBY + path, {
    headers: { cookie, accept: 'text/event-stream' },
  })
  if (!response.ok) throw new Error(`SSE ${path} -> ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      let event = 'message'
      let data = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (data) yield { event, data: JSON.parse(data) }
    }
  }
}

function pick(window) {
  const options = window.options ?? []
  // A hero's optional effect: say yes, it keeps the game moving. (The
  // server's TaskChoice options are the lowercase strings 'confirm' /
  // 'dismiss'.)
  if (window.type === 'TaskChoice' && options.includes('confirm')) return 'confirm'
  return options[0]
}

const outcome = (result) => (result.accepted ? 'ok' : result.reason ?? result.error)

/** One game, start to leave. Resolves when the bot has left the table. */
function play({ gameId, webSocketUrl }) {
  return new Promise((resolve) => {
    log('joining', gameId, 'at', webSocketUrl)
    const socket = io(webSocketUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie },
    })
    let lastVersion = -1
    let acting = false

    const send = (type, payload = {}) =>
      new Promise((ack) =>
        socket.emit('game:command', { commandId: randomUUID(), type, payload }, ack),
      )

    const onSnapshot = async (snapshot) => {
      if (snapshot.version <= lastVersion) return
      lastVersion = snapshot.version
      const state = snapshot.state

      if (state.phase === 'Concluded') {
        const winner = state.seats.find((seat) => seat.playerId === state.winnerId)
        log('game over, winner:', winner?.name ?? state.winnerId ?? 'nobody')
        const result = await send('LeaveGame')
        log('leave', outcome(result))
        socket.disconnect()
        resolve()
        return
      }
      if (acting) return

      const mine = state.pendingWindows.filter((window) => window.isYours && window.options?.length)
      if (mine.length > 0) {
        acting = true
        await delay(Math.min(THINK_MS, 500))
        for (const window of mine) {
          const choice = pick(window)
          const result = await send('SubmitChoice', { windowId: window.windowId, choice })
          log('answered', window.type, JSON.stringify(choice), outcome(result))
        }
        acting = false
        return
      }

      const myTurn =
        state.phase === 'Turns' &&
        state.currentPlayerId === state.playerId &&
        !state.busy &&
        state.pendingWindows.length === 0
      if (!myTurn) return

      // One action per snapshot, in order of usefulness: slay a monster the
      // party qualifies for, put a hero down, draw, and only then pass. The
      // engine ends the turn itself when the action points run out.
      acting = true
      await delay(THINK_MS)
      const me = state.seats.find((seat) => seat.playerId === state.playerId)
      const points = me?.actionPoints ?? 0
      const monsterId = state.attackableMonsterIds[0]
      const hero = state.hand.find((card) => card.type === 'Hero')
      const attempts = []
      if (points > 0 && monsterId) attempts.push(['AttackMonster', { monsterId }])
      if (points > 0 && hero) attempts.push(['PlayHero', { cardId: hero.id }])
      if (points > 0 && state.mainDeck.count > 0) attempts.push(['DrawCard', {}])
      attempts.push(['EndTurn', {}])
      for (const [type, payload] of attempts) {
        const result = await send(type, payload)
        const what = type === 'PlayHero' ? hero.name : type === 'AttackMonster' ? state.monsterRow.find((m) => m.id === monsterId)?.name : ''
        log(type, what, outcome(result))
        if (result.accepted) break
      }
      acting = false
    }

    socket.on('connect', () => log('socket connected'))
    socket.on('connect_error', (error) => log('connect_error:', error.message))
    socket.on('disconnect', (reason) => log('socket disconnected:', reason))
    socket.on('game-started', (snapshot) => {
      log('table live, version', snapshot.version, 'seats', snapshot.state.seats.map((seat) => seat.name).join(', '))
      void onSnapshot(snapshot)
    })
    socket.on('game:snapshot', (snapshot) => void onSnapshot(snapshot))
    socket.on('game-completed', (snapshot) => void onSnapshot(snapshot))
  })
}

async function main() {
  const account = await authenticate()
  log('account', account.accountId)
  let readied = false
  let started = false

  for (;;) {
    try {
      for await (const { event, data } of events('/lobby/events')) {
        if (event === 'lobby-updated') {
          const ready = data.readyPlayers.length
          // a HUMAN is ready: somebody who is neither this bot nor a peer bot
          const humanReady = data.readyPlayers.some(
            (player) => player.username !== username && !PEERS.has(player.username),
          )
          if (data.self.state === 'IDLE' && !readied && (HOST_AT > 0 || humanReady)) {
            readied = true
            await call('/lobby/ready', 'POST')
            log('ready')
          } else if (data.self.state === 'READY' && data.self.isHost && HOST_AT === 0) {
            // The host is whoever readied first and only the host sees Start:
            // a bot must never be it (the human who was host left the seat).
            // Stand up; ready again once somebody else is ready.
            readied = false
            await call('/lobby/ready', 'DELETE')
            log('was host — stood up so a human can be')
          } else if (
            data.self.state === 'READY' &&
            data.self.isHost &&
            HOST_AT > 0 &&
            ready >= HOST_AT &&
            !started
          ) {
            started = true
            const result = await call('/lobby/start-game', 'POST')
            log('started', result.gameId)
          }
        } else if (event === 'game-assigned') {
          await play(data)
          readied = false
          started = false
          log('back in the lobby')
        }
      }
      log('lobby stream ended, reconnecting')
    } catch (error) {
      log('lobby error:', error.message)
    }
    await delay(2000)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
