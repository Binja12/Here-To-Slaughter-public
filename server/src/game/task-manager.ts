import {
  GameEventType,
  IGameEvent,
  IGameEventEmitter,
  IGameEventListener,
} from 'shared'
import {
  AbilityTrigger,
  IEffect,
  IAbility,
  IReactionManager,
  ITask,
} from './interfaces'
import { AbilityPipeline, GameState } from './game-state'

import { AbilityContext } from './ability-context'
import { abilityRegistry } from './abilities'
import { isEffectExpired } from './expiries'
import { triggerMatches } from './trigger-matching'
import { GameEventFactory } from './events/game-event-factory'

/** One ability to check this event, and who owns it. Gathered fresh per event. */
type AbilitySource = {
  trigger: AbilityTrigger
  steps: ITask[]
  sourceCardId: string
  ownerId: string
}

// ---------------------------------------------------------------------------
// TaskManager — the Task pipeline, opposite TurnManager's Action queue (§1).
//
// Per event: expire finished effects, add a pipeline for every ability whose
// trigger fits, then drain the stack.
//
// Card abilities are derived from the party each event; ongoing effects are
// stored on Player.
// ---------------------------------------------------------------------------

export class TaskManager implements IGameEventListener {
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

  /** True while drain() is looping. Not game state — it never snapshots. */
  private draining = false

  // ---------------------------------------------------------------------------
  // IGameEventListener
  // ---------------------------------------------------------------------------

  onEvent(event: IGameEvent): void {
    // Before trigger matching, so an effect ending on this event is already
    // gone for anything the same event fires.
    this.sweepExpired(event)

    // FrameResolved additionally wakes whatever waited on this frame; it is
    // matched like any other event afterwards, which is how a played card's
    // entry fires (§1).
    if (event.getType() === GameEventType.FrameResolved) {
      const { frameId, result } = event.getPayload() as {
        frameId: string
        result?: { key: string; value: unknown }
      }
      // After a rollback nothing is paused on it any more — that pipeline went
      // with the snapshot — but the ones underneath came back and still need
      // to finish, so the drain below runs either way.
      for (const pipeline of this.gs.abilityPipelines) {
        if (pipeline.pausedOn !== frameId) continue
        pipeline.pausedOn = undefined
        // The window named both the slot and the value (resultKey).
        if (result) pipeline.ctx.set(result.key, result.value)
      }
    }

    // Matched after the wake, so anything this event starts goes on top of it
    // and resolves first.
    const matched: AbilityPipeline[] = []

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

      // Copy the steps: the drain consumes the array, and the declaration's
      // own list is built once at module load and reused forever.
      matched.push({ steps: [...source.steps], ctx })
    }

    this.add(matched)
    this.drain()
  }

  // ---------------------------------------------------------------------------
  // The pipeline stack
  // ---------------------------------------------------------------------------

  /** Adds pipelines so the first one listed is the first one to go. */
  private add(pipelines: AbilityPipeline[]): void {
    // Backwards, because the top of the stack is what runs next.
    for (let i = pipelines.length - 1; i >= 0; i--) {
      this.gs.abilityPipelines.push(pipelines[i])
    }
  }

  // ---------------------------------------------------------------------------
  // IEffect lifetimes
  // ---------------------------------------------------------------------------

  private sweepExpired(event: IGameEvent): void {
    const expired: IEffect[] = []

    for (const player of this.gs.getPlayers()) {
      // Decide first, remove second, so expiry cannot depend on list order.
      const doomed = player
        .getAllEffects()
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

  /**
   * Runs steps until there are none left to run.
   *
   * The flag is what TurnManager gets from having two methods: `enqueue`
   * drains, `enqueueFirst` only queues because its caller is already inside
   * the loop. Every caller here arrives through onEvent instead, so the flag
   * tells the two apart — a mid-drain event only adds pipelines, and the loop
   * already going reaches them on its next turn.
   *
   * Without it, ANY event re-enters and runs the current pipeline's next step
   * inside the emitting step's body: DrawTask emits CardDrawn before writing
   * its slot, so the condition behind it reads nothing.
   */
  private drain(): void {
    if (this.draining) return
    this.draining = true
    try {
      for (let next = this.nextStep(); next; next = this.nextStep()) {
        const { pipeline, step } = next
        const frameId = step.execute(this.gs, pipeline.ctx, this.em, this.rm)
        if (frameId) return this.pauseOn(pipeline, frameId, step)
      }
    } finally {
      this.draining = false
    }
  }

  /**
   * The next step to run, or nothing if the stack is empty or blocked.
   *
   * Blocked means the top pipeline is paused, and everything under it waits
   * for the same frame. Asking whether that frame is still open would NOT
   * work: a window deletes its frame before it announces the outcome, so the
   * stack would carry on before the answer had arrived.
   */
  private nextStep(): { pipeline: AbilityPipeline; step: ITask } | undefined {
    while (this.gs.abilityPipelines.length > 0) {
      const top = this.gs.abilityPipelines[this.gs.abilityPipelines.length - 1]
      if (top.pausedOn) return undefined

      const step = top.steps.shift()
      if (step) return { pipeline: top, step }

      this.gs.abilityPipelines.pop() // spent
    }
    return undefined
  }

  /**
   * Parks a pipeline until its frame resolves.
   *
   * It stays on the stack, because the pipelines under it are the ones that
   * must wait; lifting it off would let the next drain walk straight past
   * them. It is also cut out of the frame's snapshot — that snapshot was taken
   * by the step that just paused, so it still holds this pipeline, and a
   * rollback would otherwise bring the rest of a failed run back to life.
   * Undoing a frame IS cancelling what it waited for; the same two-place write
   * burnCard makes.
   */
  private pauseOn(
    pipeline: AbilityPipeline,
    frameId: string,
    step: ITask,
  ): void {
    // Nothing would ever send the FrameResolved that wakes it.
    if (!this.gs.frames.has(frameId)) {
      throw new Error(
        `${step.constructor.name} returned frameId "${frameId}", ` +
          'which is not an open frame.',
      )
    }

    pipeline.pausedOn = frameId

    const snapshot = this.gs.frames.get(frameId)?.snapshot
    if (!snapshot) return
    // Identified by context: snapshots copy the record but share the context.
    snapshot.abilityPipelines = snapshot.abilityPipelines.filter(
      (p) => p.ctx !== pipeline.ctx,
    )
  }
}
