import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Generic click-to-target system for interactive actions (steal, challenge,
 * attack, item attach…).
 *
 * FLOW: clicking a playable card that needs a target calls `begin()` with a
 * TargetingRequest — the SOURCE card's key, the list of valid TARGET keys
 * (later straight from the server), and an `onPick` callback. While a request
 * is active the board enters "targeting mode": everything dims + blurs
 * (CSS `.targeting .dimmable` in index.css) EXCEPT the source (bright) and
 * the targets (bright + green aura). Clicking a target resolves `onPick`;
 * clicking the source, anywhere else, or pressing Escape cancels.
 *
 * SEPARATION OF CONCERNS (why this stays versatile):
 *  - Board elements know only their own identity (`useTargetable(key)`); they
 *    never know WHICH action is running or why they're a target.
 *  - Actions are pure data: {source, targets, onPick}. Adding a new
 *    interaction (challenge, attack, hero steal…) is ONE `begin()` call — no
 *    component changes, as long as its targets are keyed board elements.
 *  - Playability (may I start this action?) stays in PlayableFlags; this
 *    module only handles the pick-a-target step after activation.
 *
 * KEYS: every board element gets a stable string TargetKey via the `tkey`
 * builders below. The server will eventually speak the same vocabulary
 * (e.g. "steal targets: [handStack:p2, handStack:p3]").
 */

export type TargetKey = string;

/** canonical key builders — every targetable board element has exactly one */
export const tkey = {
  /** a seat's party leader */
  leader: (player: string): TargetKey => `leader:${player}`,
  /** a monster slain by a seat's party, displayed behind its leader */
  slainMonster: (player: string, index: number): TargetKey =>
    `slainMonster:${player}:${index}`,
  /** a hero on a seat's board, index-aligned with its hero row */
  hero: (player: string, index: number): TargetKey => `hero:${player}:${index}`,
  /** a seat's face-down hand stack (steal/discard-at-random targets) */
  handStack: (player: string): TargetKey => `handStack:${player}`,
  /** a card in the LOCAL hand fan, index-aligned */
  handCard: (index: number): TargetKey => `handCard:${index}`,
  /** an equipped item, index-aligned with its hero row */
  item: (player: string, heroIndex: number): TargetKey =>
    `item:${player}:${heroIndex}`,
  /** one of the 3 flipped arena monsters, left → right */
  monster: (index: number): TargetKey => `monster:${index}`,
  mainDeck: (): TargetKey => "mainDeck",
  monsterDeck: (): TargetKey => "monsterDeck",
  discard: (): TargetKey => "discard",
  /** a visible card inside the discard browser, top card = index 0 */
  discardCard: (index: number): TargetKey => `discardCard:${index}`,
  pendingWindow: (windowId: string): TargetKey => `pendingWindow:${windowId}`,
  /** one side's live roll in the challenge window — the roll PANEL is the
   *  clickable target (e.g. aiming a modifier card at a roll) */
  challengeRoll: (role: "challenged" | "challenger"): TargetKey =>
    `challengeRoll:${role}`,
};

export interface TargetingRequest {
  /** the card the action originates from — stays bright, click = cancel */
  source: TargetKey;
  /** valid picks — bright + green aura (later provided by the server) */
  targets: readonly TargetKey[];
  /** called with the picked target; targeting mode ends first */
  onPick: (target: TargetKey, source: TargetKey) => void;
  /** called when the user backs out (Escape / click-away / click source) */
  onCancel?: () => void;
  /** reaction and choice targeting keep the table readable under a gentler
   *  dim; a choice (the engine asking "pick a card / player / monster")
   *  glows its targets gold instead of green. */
  tone?: "normal" | "reaction" | "choice";
}

interface TargetingContextValue {
  /** the running request, or null when the board is in normal mode */
  active: TargetingRequest | null;
  begin: (request: TargetingRequest) => void;
  pick: (target: TargetKey) => void;
  cancel: () => void;
}

const TargetingContext = createContext<TargetingContextValue>({
  active: null,
  begin: () => {},
  pick: () => {},
  cancel: () => {},
});

export function TargetingProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<TargetingRequest | null>(null);
  // synchronous mirror so pick/cancel read the CURRENT request inside event
  // handlers (state reads would be one render stale)
  const activeRef = useRef<TargetingRequest | null>(null);

  const begin = useCallback((request: TargetingRequest) => {
    activeRef.current = request;
    setActive(request);
  }, []);

  const cancel = useCallback(() => {
    const prev = activeRef.current;
    activeRef.current = null;
    setActive(null);
    prev?.onCancel?.();
  }, []);

  const pick = useCallback((target: TargetKey) => {
    const request = activeRef.current;
    if (!request || !request.targets.includes(target)) return;
    activeRef.current = null;
    setActive(null);
    request.onPick(target, request.source);
  }, []);

  // Escape backs out of targeting from anywhere
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, cancel]);

  const value = useMemo(
    () => ({ active, begin, pick, cancel }),
    [active, begin, pick, cancel]
  );
  return (
    <TargetingContext.Provider value={value}>
      {children}
    </TargetingContext.Provider>
  );
}

export function useTargeting() {
  return useContext(TargetingContext);
}

/** this element's role in the current targeting request */
export type TargetableMode = "idle" | "source" | "target" | "dimmed";

/**
 * Makes one board element participate in targeting mode. Every card-ish
 * element calls this (key may be undefined for purely decorative content):
 * spread `className` onto the element that should dim/glow and `onClick`
 * onto the same (or an enclosing) element.
 *
 * `onActivate` is the element's own "clicked in NORMAL mode" behaviour —
 * e.g. the leader beginning its steal action. It never fires while a request
 * is active, so action-starting cards can't stack requests.
 */
export function useTargetable(key?: TargetKey, onActivate?: () => void) {
  const { active, pick, cancel } = useTargeting();

  let mode: TargetableMode = "idle";
  if (active) {
    mode =
      key !== undefined && active.targets.includes(key)
        ? "target"
        : key === active.source
          ? "source"
          : "dimmed";
  }

  const onClick = (e: React.MouseEvent) => {
    if (mode === "target" && key !== undefined) {
      e.stopPropagation();
      pick(key);
    } else if (mode === "source") {
      e.stopPropagation();
      cancel();
    } else if (mode === "idle" && onActivate) {
      e.stopPropagation();
      onActivate();
    }
    // dimmed: fall through so the click bubbles to the board root → cancel
  };

  const className =
    mode === "target"
      ? "dimmable dim-exempt target-aura cursor-pointer"
      : mode === "source"
        ? "dimmable dim-exempt cursor-pointer"
        : mode === "idle" && onActivate
          ? "dimmable cursor-pointer"
          : "dimmable";

  return { mode, className, onClick, targeting: active !== null };
}
