import { GameEventType, IGameEvent, IGameEventEmitter, IGameEventListener } from 'shared'
import { ITask } from './interfaces'
import { GameState } from './game-state'

import { AbilityContext, CTX_FRAME_RESULTS } from './ability-context'
import type { ReactionManager } from './reactions/reaction-manager'

export class AbilityProcessor implements IGameEventListener {
  constructor(
    private readonly gs: GameState,
    private readonly em: IGameEventEmitter,
    private readonly rm: ReactionManager,
  ) {
    em.addListener(this)
  }

  // ---------------------------------------------------------------------------
  // IGameEventListener
  // ---------------------------------------------------------------------------

  onEvent(event: IGameEvent): void {
    // FrameResolved — resume a suspended pipeline.
    if (event.getType() === GameEventType.FrameResolved) {
      const { frameId, results } = event.getPayload() as {
        frameId: string
        results: unknown[]
      }
      const entry = this.gs.abilityPipelines.get(frameId)
      if (!entry) return
      this.gs.abilityPipelines.delete(frameId)
      entry.ctx.set(CTX_FRAME_RESULTS, results)
      this.runSteps(entry.steps, entry.ctx)
      return
    }

    const payload = event.getPayload() as Record<string, unknown> | undefined

    // Passive sources — leaders, monsters, equipped items.
    for (const { cardId, ownerId } of this.passiveSources()) {
      const ability = this.gs.getCardAbility(cardId)
      if (!ability?.trigger || ability.trigger !== event.getType()) continue
      this.runSteps(ability.steps ?? [], new AbilityContext(cardId, ownerId))
    }

    // Active sources — heroes and instance cards (filtered by payload.cardId).
    for (const { cardId, ownerId } of this.activeSources()) {
      const ability = this.gs.getCardAbility(cardId)
      if (!ability?.trigger || ability.trigger !== event.getType()) continue
      if (!payload?.cardId || payload.cardId !== cardId) continue
      this.runSteps(ability.steps ?? [], new AbilityContext(cardId, ownerId))
    }
  }

  // ---------------------------------------------------------------------------
  // Step runner
  // ---------------------------------------------------------------------------

  private runSteps(steps: ITask[], ctx: AbilityContext): void {
    for (let i = 0; i < steps.length; i++) {
      steps[i].execute(this.gs, ctx, this.em, this.rm)

      const frameId = this.rm.takeLastFrameId()
      if (frameId) {
        // Step opened a reaction frame — suspend; resume on FrameResolved.
        this.gs.abilityPipelines.set(frameId, { steps: steps.slice(i + 1), ctx })
        return
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Source scanners
  // ---------------------------------------------------------------------------

  private passiveSources(): { cardId: string; ownerId: string }[] {
    const out: { cardId: string; ownerId: string }[] = []
    for (const player of this.gs.getPlayers()) {
      const pid = player.getId()
      const party = this.gs.getParty(pid)

      out.push({ cardId: party.getLeaderId(), ownerId: pid })

      for (const monsterId of party.getMonsterIds()) {
        out.push({ cardId: monsterId, ownerId: pid })
      }

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
      for (const instanceId of party.getInstanceCardIds()) {
        out.push({ cardId: instanceId, ownerId: pid })
      }
    }
    return out
  }
}
