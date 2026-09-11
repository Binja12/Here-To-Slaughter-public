import { useEffect, useMemo, useState } from 'react'
import type { PlayerView } from '../contract'
import { artFor } from '../board/assets'
import { BIG_BACK, SMALL_BACK } from '../board/assets'
import { FRAMES, HUD, TABLE_BG } from '../board/layout'
import { imageUrl } from './AssetImage'

/**
 * The images the FIRST board needs — the felt, every painted frame and widget,
 * and the art of every card the opening view puts on the table. The board is
 * held behind the loading screen until these have decoded, so the table never
 * appears half-painted (the owner, 2026-09-08).
 *
 * Only what the first view actually shows: a card drawn later loads the
 * ordinary way, and speculative warm-up (loading/warmup.ts) has usually
 * fetched it already.
 */
export function firstBoardImages(view: PlayerView): string[] {
  const cards = [
    ...view.hand,
    ...view.monsterRow,
    ...view.discardPile.slice(0, 1),
    ...view.parties.flatMap((party) => [
      party.leader,
      ...party.heroes.flatMap((hero) =>
        hero.equippedItem ? [hero.card, hero.equippedItem] : [hero.card],
      ),
      ...party.monsters,
      ...party.instanceCards,
    ]),
  ]
  return Array.from(
    new Set([
      TABLE_BG,
      ...Object.values(FRAMES),
      ...Object.values(HUD),
      SMALL_BACK,
      BIG_BACK,
      ...cards.map((card) => artFor(card).url),
    ]),
  )
}

/**
 * Whether every one of `urls` has decoded. A `data:` URL (the placeholder card)
 * is already here, and a URL that never loads must not hold the table for
 * ever: the wait gives up after `timeoutMs` and the board paints anyway, one
 * broken image being better than a game nobody can enter.
 *
 * Thirty seconds (the owner, 2026-09-08): long enough for a cold client to
 * fetch a whole table's art before anyone has to act on it. Nothing counts it
 * down on screen — the wait is the "dealing the table" line and nothing else.
 */
export function useImagesReady(urls: string[], timeoutMs = 30_000): boolean {
  const key = urls.join('|')
  const list = useMemo(() => urls, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(list.length === 0)

  useEffect(() => {
    if (list.length === 0) {
      setReady(true)
      return
    }
    let live = true
    setReady(false)
    let left = list.length
    const done = () => {
      if (!live) return
      left -= 1
      if (left <= 0) setReady(true)
    }
    const images = list.map((url) => {
      const image = new Image()
      // decode failures count as done: the board must not wait on a 404
      image.onload = done
      image.onerror = done
      image.src = url.startsWith('data:') ? url : imageUrl(url)
      if (image.complete) done()
      return image
    })
    const timer = window.setTimeout(() => {
      if (live) setReady(true)
    }, timeoutMs)
    return () => {
      live = false
      window.clearTimeout(timer)
      for (const image of images) {
        image.onload = null
        image.onerror = null
      }
    }
  }, [list, timeoutMs])

  return ready
}
