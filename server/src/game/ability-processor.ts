import {
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  IGameEventListener,
} from 'shared'
import {
  AbilityTrigger,
  ActiveEffect,
  IAbility,
  IReactionManager,
  ITask,
} from './interfaces'
import { GameState } from './game-state'

import { AbilityContext } from './ability-context'
import { abilityRegistry } from './abilities'
import { isEffectExpired, triggerMatches } from './effects'
import { GameEventFactory } from './events/game-event-factory'

/** One ability to check this event, and who owns it. Gathered fresh per event. */
type AbilitySource = {
  trigger: AbilityTrigger
  steps: ITask[]
  sourceCardId: string
  ownerId: string
}

// ---------------------------------------------------------------------------
// AbilityProcessor — per event: expire finished effects, then run every
// ability whose trigger fits. Card abilities are derived from the party each
// event; ongoing effects are stored on Player.
// ---------------------------------------------------------------------------

export class AbilityProcessor implements IGameEventListener {
  constructor(
    private readonly gs: GameState,
    private readonly em: IGameEventEmitter,
    private readonly rm: IReactionManager,
    /** Keyed by card id. Injected so tests can supply their own table. */
    private readonly abilities: ReadonlyMap<
      string,
      IAbility[]
    > = abilityRegistry,
  ) {
    em.addListener(this)
  }

  // ---------------------------------------------------------------------------
  // IGameEventListener
  // ---------------------------------------------------------------------------

  onEvent(event: IGameEvent): void {
    // Before trigger matching, so an effect ending on this event is already
    // gone for anything the same event fires.
    this.sweepExpired(event)

    // FrameResolved — resume a suspended pipeline.
    if (event.getType() === GameEventType.FrameResolved) {
      const { frameId, result } = event.getPayload() as {
        frameId: string
        result?: { key: string; value: unknown }
      }
      // A rolled-back frame discarded its entry with the snapshot.
      const entry = this.gs.abilityPipelines.get(frameId)
      if (!entry) return
      this.gs.abilityPipelines.delete(frameId)
      // The window named both slot and value (IReactionWindow.resultKey).
      if (result) entry.ctx.set(result.key, result.value)
      this.runSteps(entry.steps, entry.ctx)
      return
    }

    for (const source of this.abilitySources()) {
      if (!triggerMatches(this.gs, source, source.trigger, event)) continue

      const ctx = new AbilityContext(source.sourceCardId, source.ownerId)
      // Continuations run with a fresh context, so what they need travels on
      // the event — see ConfirmTask and CardTypeCondition.
      const { ctxSeed } = (event.getPayload() ?? {}) as {
        ctxSeed?: Record<string, unknown>
      }
      if (ctxSeed) {
        for (const [key, value] of Object.entries(ctxSeed)) ctx.set(key, value)
      }

      this.runSteps(source.steps, ctx)
    }
  }

  // ---------------------------------------------------------------------------
  // Effect lifetimes
  // ---------------------------------------------------------------------------

  private sweepExpired(event: IGameEvent): void {
    const expired: ActiveEffect[] = []

    for (const player of this.gs.getPlayers()) {
      // Decide first, remove second, so expiry cannot depend on list order.
      const doomed = player
        .getEffects()
        .filter((effect) => isEffectExpired(this.gs, effect, event))

      for (const effect of doomed) player.removeEffect(effect.id)
      expired.push(...doomed)
    }

    // Pruned before announcing, so no listener sees a dead entry.
    for (const effect of expired) {
      this.em.emit(
        GameEventFactory.effectExpired(
          effect.ownerId,
          effect.id,
          effect.sourceCardId,
        ),
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Which abilities to check for this event
  // ---------------------------------------------------------------------------

  private abilitySources(): AbilitySource[] {
    const out: AbilitySource[] = []

    for (const player of this.gs.getPlayers()) {
      const pid = player.getId()
      const party = this.gs.getParty(pid)

      // --- Cards in play: derived from position, every event ---
      this.pushCardAbility(out, party.getLeaderId(), pid)

      for (const monsterId of party.getMonsterIds()) {
        this.pushCardAbility(out, monsterId, pid)
      }

      for (const heroId of party.getHeroIds()) {
        this.pushCardAbility(out, heroId, pid)
        const equippedItem = this.gs.getEquippedItem(heroId)
        if (equippedItem) this.pushCardAbility(out, equippedItem, pid)
      }

      for (const instanceId of party.getInstanceCardIds()) {
        this.pushCardAbility(out, instanceId, pid)
      }

      // --- Ongoing effects: stored, until an event expires them ---
      for (const effect of player.getEffects()) {
        if (!effect.trigger || !effect.steps) continue // a passive flag only
        out.push({
          trigger: effect.trigger,
          steps: effect.steps,
          sourceCardId: effect.sourceCardId,
          ownerId: effect.ownerId,
        })
      }
    }

    return out
  }

  /** Adds every entry registered for a card — see abilities/index.ts. */
  private pushCardAbility(
    out: AbilitySource[],
    cardId: string,
    ownerId: string,
  ): void {
    for (const ability of this.abilities.get(cardId) ?? []) {
      if (!ability.trigger) continue
      out.push({
        trigger: ability.trigger,
        steps: ability.steps,
        sourceCardId: cardId,
        ownerId,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Step runner
  // ---------------------------------------------------------------------------

  private runSteps(steps: ITask[], ctx: AbilityContext): void {
    for (let i = 0; i < steps.length; i++) {
      const frameId = steps[i].execute(this.gs, ctx, this.em, this.rm)

      if (frameId) {
        // Only a live frame can be resumed — FrameResolved comes from the
        // window that owns it.
        if (!this.gs.frames.has(frameId)) {
          throw new Error(
            `${steps[i].constructor.name} returned frameId "${frameId}", ` +
              'which is not an open frame.',
          )
        }

        // Step opened a reaction frame — suspend; resume on FrameResolved.
        this.gs.abilityPipelines.set(frameId, {
          steps: steps.slice(i + 1),
          ctx,
        })
        return
      }
    }
  }
}
