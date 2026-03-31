export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function roll2Dice(): number {
  return rollDie() + rollDie()
}
