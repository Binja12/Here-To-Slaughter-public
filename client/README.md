# Getting Started with Create React App

## Server adapters

The UI talks only to `LobbyPort` and `GamePort`. The real adapters use HTTP/SSE
for authentication and the lobby, then Socket.IO at the per-game URL supplied
by `game-assigned`. The fake adapters implement the same contracts entirely in
memory for an offline auth → lobby → board → game-over demo.

- `REACT_APP_LOBBY_URL` sets the auth/lobby origin (default:
  `http://localhost:3000`).
- `REACT_APP_FAKE_SERVER=1` selects both in-memory adapters; unset it to use the
  real servers.

For example, in PowerShell run
`$env:REACT_APP_FAKE_SERVER='1'; npm start`. There is no configurable game URL:
the lobby assignment is the source of truth.

`.env` pins the dev server to port 3002 because the lobby owns 3000. Reach
everything as `localhost` (never `127.0.0.1`) so the session cookie also
reaches the game server. The real servers are started from the HTSR-4
worktree; see `docs/CLIENT_PLAYTEST_TODO.md` for the run book.

## Bot seats

`scripts/bot-seat.mjs` is a headless player for local playtests: it registers,
readies once somebody else is ready, joins its game and plays a dumb legal game
(attack, play a hero, draw, end turn), answering every choice with its first
option. One browser plus two bots is a three-seat table on one machine:

```
node scripts/bot-seat.mjs alice
node scripts/bot-seat.mjs bob
```

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
