# Second playtest — known card gaps

All 136 printed card ids are registered and included in the default game.
Silent Shadow can retrieve a chosen card, Arctic Aries no longer reacts to a
leader activation, Pan Chucks and Rex Major can reveal cards, and Quick Draw
chooses an Item from the two cards it drew before playing it.

The remaining known gaps are:

- **Bullseye (`hero-014`) does not ask for the order of the two cards it puts
  back on top.** It lets the player inspect the top three and draw one,
  but the other two keep their existing relative order. The engine has no
  task or window for reordering cards on a deck.
- **Call to the Fallen (`magic-061`) has no edited board scan.** Its mechanics
  are implemented, but the client intentionally falls back to the generic
  Magic template in `client/src/board/assets.ts`.
