/** Returns a random integer in [1, 6]. */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

/** Returns the sum of two independent d6 rolls. */
export function roll2Dice(): number {
  return rollDie() + rollDie()
}
