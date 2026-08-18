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

/**
 * One ability to check against the current event, and who it belongs to.
 * Gathered fresh per event; nothing here is retained between events.
 *
 * Two kinds of source produce these — a card in play (found by its position)
 * and an ongoing effect (stored on its owner) — and both check through the same
 * trigger, so the run loop treats them alike.
 */
type AbilitySource = {
  trigger: AbilityTrigger
  steps: ITask[]
  sourceCardId: string
  ownerId: string
}

// ---------------------------------------------------------------------------
// AbilityProcessor
//
// Per event: expire finished effects, then run everything whose trigger fits.
//
// Card abilities are never stored. A card's ability is live because the card is
// in play — read fresh from the party each event — so it cannot fall out of
// sync with reality: a stolen hero's ability belongs to its new owner with no
// bookkeeping at all, and a destroyed hero stops listening the moment it leaves.
//
// Ongoing effects are the exception, and the reason ActiveEffect exists: "your
// heroes cannot be stolen until your next turn" has no card position to derive
// from, so it is stored on the player until an expiry event removes it.
// ---------------------------------------------------------------------------

export class AbilityProcessor implements IGameEventListener {
  constructor(
    private readonly gs: GameState,
    private readonly em: IGameEventEmitter,
    private readonly rm: IReactionManager,
    /**
     * Card behaviour, keyed by card id. Injected so a test can supply its own
     * table instead of registering real cards.
     */
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
    // Lifetimes first, so an effect ending on this event is already gone for
    // anything the same event triggers — "until your next turn" means the turn
    // starts clean.
    this.sweepExpired(event)

    // FrameResolved — resume a suspended pipeline.
    if (event.getType() === GameEventType.FrameResolved) {
      const { frameId, result } = event.getPayload() as {
        frameId: string
        result?: { key: string; value: unknown }
      }
      // A window that rolled its frame back (failed roll, lost challenge,
      // dismissed prompt) has already discarded the entry with the snapshot —
      // there is nothing left to resume.
      const entry = this.gs.abilityPipelines.get(frameId)
      if (!entry) return
      this.gs.abilityPipelines.delete(frameId)
      // The window named both the slot and the value; the processor never
      // inspects or reshapes it.
      if (result) entry.ctx.set(result.key, result.value)
      this.runSteps(entry.steps, entry.ctx)
      return
    }

    for (const source of this.abilitySources()) {
      if (!triggerMatches(this.gs, source, source.trigger, event)) continue

      const ctx = new AbilityContext(source.sourceCardId, source.ownerId)
      // A continuation runs with a FRESH context, so whatever it needs from the
      // pipeline that asked has to travel on the event. Generic on purpose: the
      // processor copies slots without knowing what any of them mean.
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
      // Decide first, remove second: every shouldExpire runs against the same
      // pre-sweep state, so expiry cannot depend on the order of the list.
      const doomed = player
        .getEffects()
        .filter((effect) => isEffectExpired(this.gs, effect, event))

      for (const effect of doomed) player.removeEffect(effect.id)
      expired.push(...doomed)
    }

    // Pruned before announcing, so nothing reacting to EffectExpired can still
    // observe the dead entry.
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

  /**
   * Adds every ability entry registered for a card.
   *
   * A card holds a LIST, not one entry: an ability that pauses on a confirm is
   * declared as the part before the question plus a part triggered by the
   * answer. Both are the same card's behaviour, differing only in what wakes
   * them.
   */
  private pushCardAbility(
    out: AbilitySource[],
    cardId: string,
    ownerId: string,
  ): void {
    for (const ability of this.abilities.get(cardId) ?? []) {
      // An entry with no trigger can never match; skipping keeps a malformed
      // registration inert rather than crashing every event in the game.
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
        // Only a LIVE frame can be resumed: FrameResolved comes from the window
        // that owns it, so parking the remainder under a settled frame strands
        // the steps forever and leaks the entry into every later snapshot.
        // Every window now settles on a timer, never inside the step that
        // opened it, so a frame is always live when its task hands the id back.
        // Reaching here means a step released or restored its own frame and
        // returned the id anyway — loud at the mistake, not silently stuck.
        if (!this.gs.frames.has(frameId)) {
          throw new Error(
            `${steps[i].constructor.name} returned frameId "${frameId}", which ` +
              'is not an open frame — return rm.suspendOn(frameId) instead.',
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
