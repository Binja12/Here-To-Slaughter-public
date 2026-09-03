# Prompt for Codex — implement the Here to Slaughter client against the contract

You are implementing the browser client for "Here to Slaughter", a 2–4 player card game.
Work in the `client/` workspace (React 19, Create React App, TypeScript, Tailwind v3; branch
`HTSR-5-Frontend` already has a painted board UI under `client/src/board/` and a lobby UI under
`client/src/lobby/` drawn from demo data). Your job is to wire that UI to the server through the
contract below and nothing else. **The client depends on the contract, never on the server's
implementation.** The only runtime configuration is two URLs.

## Ground rules

1. **Contract first.** Everything the client sends or receives is typed in one place,
   `client/src/contract/` (copy the shapes below verbatim; CRA cannot import from the `shared/`
   workspace, so mirror them by hand and keep the file names the same as `shared/src/`).
2. **Ports and adapters.** Define two interfaces and code the whole UI against them:
   - `LobbyPort` — HTTP + SSE to the lobby/auth server.
   - `GamePort` — Socket.IO to a game server.
   Provide two implementations of each: the real one, and an in-memory fake that scripts a plausible
   game so every screen can be developed and demoed with no server running
   (`REACT_APP_FAKE_SERVER=1` selects the fakes).
3. **The client never decides legality.** It renders what `PlayerView` says and sends commands.
   A refused command is shown as a short message from the `reason` code; nothing else changes,
   because the next snapshot is the truth.
4. **Identity is never sent.** The server knows who you are from the session cookie. No player id
   in any payload.
5. Config: `REACT_APP_LOBBY_URL` (default `http://localhost:3000`). The game server URL is NOT
   configured — the lobby hands it to you per game (`game-assigned`). All requests use
   `credentials: 'include'` / `withCredentials: true` so the `htsr_session` cookie rides along.

## Lobby/auth contract (HTTP + SSE, all JSON, cookie `htsr_session`)

```
POST /register   { username, password }  → 201 { accountId, username }   (also logs in)
POST /login      { username, password }  → 200 { accountId, username }
POST /logout     → 204
GET  /lobby      → 200 LobbySnapshot
POST /lobby/ready         → 200 LobbySnapshot
DELETE /lobby/ready       → 200 LobbySnapshot
POST /lobby/start-game    → 202 { gameId, status: "STARTING" }   (host only, 2–4 ready players)
GET  /lobby/events        → SSE stream (EventSource with credentials)
   event: lobby-updated   data: LobbySnapshot
   event: game-assigned   data: { gameId: string; webSocketUrl: string }   (only to the seated accounts)
Failures: conventional status (400/401/403/404/409) with body { reason: string }.

type LobbyPlayer   = { accountId: string; username: string }
type LobbySnapshot = {
  readyPlayers: LobbyPlayer[]                       // ordered; first is the host; max 4
  settings: { gameConfig: "default" }
  self: LobbyPlayer & { state: "IDLE" | "READY" | "IN_GAME"; isHost: boolean }
}
```

Flow: login → lobby screen (ready/unready, host sees Start when 2–4 are ready) → on
`game-assigned`, open the game socket to `webSocketUrl` and switch to the board. On reconnect to
SSE the server replays a pending `game-assigned`, so a refreshed browser lands back in its game.

## Game socket contract (Socket.IO, cookie on the handshake)

Server → client events:

```
"game-started"    GameSnapshot   // once the table is live; also on (re)connect with the current state
"game:snapshot"   GameSnapshot   // after anything changes; keep the highest `version`, drop older
"game-completed"  GameSnapshot   // final state; `state.phase === "Concluded"`

type GameSnapshot = { gameId: string; version: number; state: PlayerView }
```

Client → server, one event with a Socket.IO acknowledgement:

```
socket.emit("game:command", command, (ack: CommandResult) => …)

type GameCommand = { commandId: string; type: T; payload: P }   // commandId = crypto.randomUUID()
  T = "DrawCard"       P = {}
  T = "PlayHero"       P = { cardId }
  T = "PlayItem"       P = { cardId; targetHeroId }
  T = "PlayMagic"      P = { cardId }
  T = "RollOnHero"     P = { heroId }
  T = "RollOnLeader"   P = { leaderId }
  T = "AttackMonster"  P = { monsterId }
  T = "ReDraw"         P = {}
  T = "EndTurn"        P = {}
  T = "ApplyModifier"  P = { cardId; targetPlayerId; value }     // value: one of the card's printed `values`
  T = "Challenge"      P = { cardId; targetedCardId }             // targetedCardId = the open Challenge window's `cardId`
  T = "SubmitChoice"   P = { windowId; choice }                   // choice: one of the window's `options`
  T = "LeaveGame"      P = {}                                     // accepted only after "game-completed"

type CommandResult =
  | { commandId: string; accepted: true }
  | { commandId: string; accepted: false; reason: RefusalReason }
  | { commandId?: string; accepted: false; error: "InternalError" }   // a client bug or a server bug; show a generic toast, log it

enum RefusalReason {
  GameOver, NotYourTurn, Busy,
  NoActionPoints, CardNotInHand, HandFull, DeckEmpty,
  HeroNotInParty, NotYourLeader, AbilityAlreadyUsed, HeroEffectSealed,
  NotAnItem, NotAHero, HeroAlreadyEquipped, NotYourHero,
  MonsterNotInRow, PartyRequirementUnmet,
  AlreadyChallengedThisTurn, NoChallengeWindow, ChallengeAlreadyStarted, ChallengeNotStarted,
  NoModifiableWindow, TargetNotRolling, TargetNotInChallenge, NotAModifier, ValueNotOnCard,
  NoSuchWindow, WrongRespondent, NotAnOption
}   // string enum; each member's value equals its name. Map each to one short sentence in one file.
```

`accepted` means the engine took the request, not that the play succeeded — a challenged hero can
still lose its roll. What happened is in the next snapshot. Retrying a command reuses the same
`commandId`; the server dedupes.

## PlayerView — what one seat is allowed to see

```
type PlayerView = {
  gameId: string
  playerId: string                 // you
  seats: SeatView[]                // turn order
  currentPlayerId?: string
  phase: "Setup" | "Turns" | "Concluded"
  hand: CardView[]                 // your hand, face up to you alone
  parties: PartyView[]             // every party, including yours
  mainDeck: { count: number }
  monsterDeck: { count: number }
  discardPile: CardView[]          // face up, newest first
  monsterRow: CardView[]           // the face-up monsters that can be attacked
  attackableMonsterIds: string[]   // which of those YOUR party may attack right now
  pendingWindows: PendingWindowView[]
  busy: boolean                    // mid-resolution: grey out every action button
}
type SeatView  = { playerId; name; seat: number; isCurrentTurn: boolean; actionPoints: number; handCount: number; effects: EffectView[] }
type PartyView = { playerId; leader: CardView; heroes: HeroInPlayView[]; monsters: CardView[]; instanceCards: CardView[]; canRollOnLeader: boolean }
type HeroInPlayView = { card: CardView; equippedItem?: CardView; canRollOn: boolean }
type EffectView = { id; sourceCardId; type: PassiveType; value?: number; cardId?: string; rollContext?: string; cardTypes?: string[] }
type PendingWindowView = {
  windowId: string
  type: "Challenge" | "Modifier" | "Attack" | "PlayerChoice" | "CardChoice" | "MonsterChoice" | "TaskChoice" | "ValueChoice"
  respondentId: string             // the roller / the defender / the one player who may answer a choice
  cardId?: string                  // the card a Challenge window is about
  options?: unknown[]              // present only when isYours
  detail?: Record<string, unknown> // a roll's { rollerId, baseRoll, bonuses, finalRoll, rollReq, heroId }, a challenge's rolls, a choice's question
  deadline: number                 // epoch ms; show a countdown
  isYours: boolean
}
CardView = the printed card data: { id, name, type: "Hero"|"Item"|"Magic"|"Modifier"|"Challenge"|"Monster"|"Leader", image, description, set, …type-specific fields:
  Hero/Leader: heroClass, rollReq   Monster: higherReq, lowerReq, rollCompareMode, partyReq: { classes }   Modifier: values: number[]   Item: cursed?: boolean }
```

Card ids are per physical copy and are the ids you send back. Card images are already in
`client/public/` on the branch; `image` is the file name.

## Screens and buttons to build

1. **Auth**: register / login / logout forms; errors from `{ reason }`.
2. **Lobby**: ready list with host marked, Ready/Unready toggle, Start (host only, enabled at 2–4),
   live via SSE. On `game-assigned` connect the game socket and go to the board.
3. **Board** (reuse `client/src/board/`): render entirely from the latest `PlayerView`.
   - Turn banner: whose turn, phase, action points, `busy`.
   - Hand: click a card → the command for its `type`: Hero→PlayHero, Magic→PlayMagic,
     Item→pick a hero then PlayItem, Modifier→pick a roll target then a value then ApplyModifier,
     Challenge→enabled only while a Challenge window is open, targets its `cardId`.
   - Party: hero click → RollOnHero when `canRollOn`; leader click → RollOnLeader when `canRollOnLeader`.
   - Monster row: click → AttackMonster, enabled only for `attackableMonsterIds`.
   - Draw, ReDraw, End Turn buttons; every action button disabled unless
     `currentPlayerId === playerId && !busy && phase === "Turns"`.
   - Pending windows panel: one card per `pendingWindows` entry with its countdown from `deadline`.
     Roll/Attack/Challenge windows show `detail` (dice, bonuses, total vs requirement) to everyone
     and offer "play a modifier" from your hand. Choice windows with `isYours` show `options` as
     buttons → SubmitChoice. TaskChoice options are "CONFIRM" / "DISMISS" strings.
   - Refusal toast from the ack's `reason`; InternalError toast is generic.
   - Game over overlay when `phase === "Concluded"`, with a Leave button → LeaveGame → lobby.
4. **Reconnect**: on socket reconnect you receive `game-started` with the current snapshot; on
   page load, SSE replays `game-assigned`. No client-side game state survives a refresh, by design.

## Fakes for offline development

`FakeLobbyPort` and `FakeGamePort` implement the same interfaces and produce the same shapes:
two seated players, a scripted turn with a hero play, a challenge window that lapses, a modifier
window, a card choice. Every button must be exercisable against the fakes. Write the state hook
(`useGameState`) so that swapping the port is one line.

## Definition of done

- `npm start` in `client/` with `REACT_APP_FAKE_SERVER=1` shows auth → lobby → board → game over
  with no server running, and every command type can be sent from a button.
- Types in `client/src/contract/` match this document exactly; no `any`.
- Nothing in the client imports from `server/` or `shared/`, and no file reaches for game rules
  (no "is this card playable" logic beyond what `PlayerView` already says).
- A short `client/README.md` section: the two env vars, the port/adapter split, how to switch fakes.
