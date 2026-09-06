import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlayerId } from "./layout";
import { DiceThrow } from "./DiceRoll";
import { NONHERO_CARD_ASPECT } from "./assets";

/**
 * Challenge window state (rendered by ChallengeWindow.tsx).
 *
 * A challenge PAUSES the game: one player (the CHALLENGER) plays a challenge
 * card on another player's action (the CHALLENGED), and both roll to resolve
 * it. While a challenge is open the board root carries `.challenge-open`
 * (same dark treatment as targeting mode), the contested card takes centre
 * stage with the challenge card tucked behind it, each side's roll lands in
 * its own panel (challenged LEFT/green, challenger RIGHT/red), and the local
 * hand force-opens on the bright layer (modifiers get played from it).
 *
 * SEPARATION OF CONCERNS (mirrors targeting.tsx so engine wiring is thin):
 *  - This module is PURE STATE — who is involved, which cards, which rolls.
 *    It knows nothing about geometry (CHALLENGE_LAYOUT) or rendering.
 *  - The server will drive it 1:1 through the context API:
 *      ChallengeStarted event  → open({cards, seats})
 *      ChallengeRolled event   → setRoll(role, values, modifier)
 *      ChallengeResolved event → close()
 *  - Components ask "is a challenge open?" via useChallenge() — PlayerHand
 *    uses that to force the fan open, Board to dim + raise the hand layer.
 */

export type ChallengeRole = "challenged" | "challenger";

/** the art of one thing modifying a roll — a card played onto it or a
 *  standing effect's source (a leader, a monster, a hero) — and what it adds */
export interface RollBonusCard {
  url: string;
  amount: number;
}

/** one side's roll: the 2d6 throw + the bonus total on it
 *  (null until anything modifies it, exactly like the turn banner) */
export interface ChallengeRoll extends DiceThrow {
  modifier: number | null;
  /** everything modifying THIS roll, in the order it landed — shown fanned
   *  beside that side's panel, each with its amount */
  modifierCards: RollBonusCard[];
}

export interface ChallengeSide {
  seat: PlayerId;
  /** null until this side has rolled — the panel shows a waiting state */
  roll: ChallengeRoll | null;
}

export interface ChallengeState {
  /** art of the card whose play is being contested (centre stage) */
  challengedCardUrl: string;
  /** aspect ratio (w/h) of that art — cards differ (leader vs item vs magic) */
  challengedCardAspect: number;
  /** art of the challenge card itself (tucked behind at an angle) */
  challengeCardUrl: string;
  challenged: ChallengeSide;
  challenger: ChallengeSide;
}

export interface ChallengeOpenArgs {
  challengedCardUrl: string;
  challengedCardAspect?: number;
  challengeCardUrl: string;
  challengedSeat: PlayerId;
  challengerSeat: PlayerId;
}

interface ChallengeContextValue {
  /** the open challenge, or null when the game is not paused on one */
  active: ChallengeState | null;
  open: (args: ChallengeOpenArgs) => void;
  /** a side rolled (or re-rolled) — replays its dice, with whatever was
   *  already modifying that roll (standing effects) beside it */
  setRoll: (
    role: ChallengeRole,
    values: [number, number],
    bonuses?: RollBonusCard[],
  ) => void;
  /** something landed on one side's roll: bumps that roll's total and
   *  records the source's art (the dice do NOT re-throw — the nonce is
   *  untouched, so they stay settled on the panel) */
  addModifier: (role: ChallengeRole, amount: number, cardUrl: string) => void;
  close: () => void;
}

const ChallengeContext = createContext<ChallengeContextValue>({
  active: null,
  open: () => {},
  setRoll: () => {},
  addModifier: () => {},
  close: () => {},
});

export function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ChallengeState | null>(null);
  // per-throw nonce so identical values rolled twice still replay the dice
  const nonceSeq = useRef(0);

  const open = useCallback((args: ChallengeOpenArgs) => {
    setActive({
      challengedCardUrl: args.challengedCardUrl,
      challengedCardAspect: args.challengedCardAspect ?? NONHERO_CARD_ASPECT,
      challengeCardUrl: args.challengeCardUrl,
      challenged: { seat: args.challengedSeat, roll: null },
      challenger: { seat: args.challengerSeat, roll: null },
    });
  }, []);

  const setRoll = useCallback(
    (
      role: ChallengeRole,
      values: [number, number],
      bonuses: RollBonusCard[] = [],
    ) => {
      setActive((prev) =>
        prev
          ? {
              ...prev,
              [role]: {
                ...prev[role],
                roll: {
                  values,
                  modifier:
                    bonuses.length === 0
                      ? null
                      : bonuses.reduce((sum, bonus) => sum + bonus.amount, 0),
                  modifierCards: [...bonuses],
                  nonce: ++nonceSeq.current,
                },
              },
            }
          : prev,
      );
    },
    [],
  );

  const addModifier = useCallback(
    (role: ChallengeRole, amount: number, cardUrl: string) => {
      setActive((prev) => {
        const side = prev?.[role];
        if (!prev || !side?.roll) return prev; // nothing rolled to modify yet
        return {
          ...prev,
          [role]: {
            ...side,
            roll: {
              ...side.roll,
              modifier: (side.roll.modifier ?? 0) + amount,
              modifierCards: [...side.roll.modifierCards, { url: cardUrl, amount }],
            },
          },
        };
      });
    },
    [],
  );

  const close = useCallback(() => setActive(null), []);

  const value = useMemo(
    () => ({ active, open, setRoll, addModifier, close }),
    [active, open, setRoll, addModifier, close],
  );
  return (
    <ChallengeContext.Provider value={value}>
      {children}
    </ChallengeContext.Provider>
  );
}

export function useChallenge() {
  return useContext(ChallengeContext);
}
