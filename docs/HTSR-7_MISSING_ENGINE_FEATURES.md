# HTSR-7 — missing engine features

This branch intentionally uses only mechanics that already existed before
HTSR-7. The following parts of the requested card text cannot be represented
exactly by those mechanics.

- **Silent Shadow (`hero-021`) is not registered.** The engine can let the
  ability owner choose a card from another player's hand, but it has no task
  that moves that chosen card into the ability owner's hand. `PullCardTask`
  cannot substitute because it is random, while Silent Shadow explicitly
  chooses after looking.
- **Quick Draw (`hero-010`) has an existing-task limitation.** `DrawTask(2)`
  stores both ids, `CardTypeCondition` can detect an Item among them, and
  `PlayItemTask` can consume that slot, but the engine cannot choose/filter one
  particular card inside a context slot. The current declaration therefore
  plays the first drawn card when it is an Item; if only the second card is an
  Item, the optional play cannot be completed exactly.
- **Arctic Aries (`monster-128`) has an existing-trigger limitation.**
  `RollSuccess` does not carry a roll context that trigger matching can use.
  `OwnerEvent` correctly catches successful hero-effect rolls, but also catches
  the owner's activated Shadow Claw leader. The ability file documents this
  over-match.
- **Pan Chucks (`hero-008`) and Rex Major (`monster-132`) cannot model the
  explicit reveal operation.** Their type check, confirmation, destroy/draw,
  and card identity hand-off are implemented. The engine has no reveal/peek
  task or reveal event, so it cannot separately expose the qualifying card as
  the printed text requests.

No new task, effect, trigger scope, event, or context-slot mechanic was added
to work around these gaps.
