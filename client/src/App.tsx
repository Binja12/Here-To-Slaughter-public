import React, { useState } from 'react';
import Board from './board/Board';
import LobbyView from './lobby/LobbyView';

/* Lobby first, then the board once the game starts.
 * Dev helpers: `?board` in the URL starts on the board; the corner button
 * toggles between the two views at any time (dev-only, like "end turn (test)"). */
function App() {
  const [phase, setPhase] = useState<'lobby' | 'game'>(() =>
    new URLSearchParams(window.location.search).has('board') ? 'game' : 'lobby',
  );

  return (
    <>
      {phase === 'game' ? <Board /> : <LobbyView onStart={() => setPhase('game')} />}
      <button
        className="fixed right-2 top-2 z-[999] rounded bg-black/60 px-2 py-1 text-xs text-white/80"
        onClick={() => setPhase((p) => (p === 'game' ? 'lobby' : 'game'))}
      >
        {phase === 'game' ? 'lobby (test)' : 'board (test)'}
      </button>
    </>
  );
}

export default App;
