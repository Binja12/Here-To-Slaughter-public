import { IGameEvent, IGameEventEmitter, IGameEventListener } from 'shared' // IGameEvent kept for onEvent signature
import { IAbility } from './interfaces'
import { GameState } from './game-state'
import { AbilityContext } from './ability-context'
import { HeroCard } from './cards/hero-card'

export class AbilityProcessor implements IGameEventListener {
  constructor(
    private readonly gs: GameState,
    private readonly em: IGameEventEmitter,
  ) {
    em.addListener(this)
  }

  // ---------------------------------------------------------------------------
  // Direct invocation — magic cards and any one-shot caller
  // ---------------------------------------------------------------------------

  process(ability: IAbility, gs: GameState, ctx: AbilityContext): void {
    for (const task of ability.steps) {
      task.execute(gs, ctx, this.em)
    }
  }

  // ---------------------------------------------------------------------------
  // IGameEventListener — scans active cards on every game event
  // ---------------------------------------------------------------------------

  onEvent(event: IGameEvent): void {
    const payload = event.getPayload() as Record<string, unknown> | undefined

    for (const { cardId, ownerId } of this.passiveSources()) {
      const ability = this.gs.getCardAbility(cardId)
      if (!ability?.trigger || ability.trigger !== event.getType()) continue

      this.process(ability, this.gs, new AbilityContext(cardId, ownerId))
    }

    for (const { cardId, ownerId } of this.activeSources()) {
      const ability = this.gs.getCardAbility(cardId)
      if (!ability?.trigger || ability.trigger !== event.getType()) continue
      if (!payload?.cardId || payload.cardId !== cardId) continue
      this.process(ability, this.gs, new AbilityContext(cardId, ownerId))
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Passive sources — scanned on every game event without any explicit play.
   * Includes: party leaders, equipped items, and active monsters.
   */
  private passiveSources(): { cardId: string; ownerId: string }[] {
    const out: { cardId: string; ownerId: string }[] = []

    for (const player of this.gs.getPlayers()) {
      const pid = player.getId()
      const party = this.gs.getParty(pid)

      // Leader — always passive
      out.push({ cardId: party.getLeaderId(), ownerId: pid })

      for (const monsterId of party.getMonsterIds()) {
        out.push({ cardId: monsterId, ownerId: pid })
      }

      // Equipped items — passive; heroes themselves are NOT included
      for (const heroId of party.getHeroIds()) {
        const equippedItem = this.gs.getEquippedItem(heroId)
        if (equippedItem) out.push({ cardId: equippedItem, ownerId: pid })
      }
    }
    return out
  }

  private activeSources(): { cardId: string; ownerId: string }[] {
    const out: { cardId: string; ownerId: string }[] = []
    for (const player of this.gs.getPlayers()) {
      const pid = player.getId()
      const party = this.gs.getParty(pid)
      for (const heroId of party.getHeroIds()) {
        out.push({ cardId: heroId, ownerId: pid })
      }
    }
    return out
  }
}
