import generated from '../generated/asset-catalog.json'
import deliverySettings from './deliverySettings.json'

export type MusicSegment = { url: string; startSeconds: number; durationSeconds: number }
export type ImageEntry = { full: string; variants: [number, string][] }
export const catalog = generated as unknown as {
  images: Record<string, ImageEntry>
  files: Record<string, string>
  music: Record<string, MusicSegment[]>
}

export const sourcePath = (url: string) => url.split('?')[0]
export const MUSIC_SECONDS = deliverySettings.musicSeconds

export function musicPlaylist(source: string): MusicSegment[] | undefined {
  return catalog.music[source]?.filter((part) => part.startSeconds < MUSIC_SECONDS)
}

/**
 * The one export the catalog holds for an image — a 720p-stage copy, and for a
 * background the master's own size (scripts/online-art-sizes.mjs). It does NOT
 * depend on the viewport: the profile IS the default, so a 4K screen gets the
 * same file a laptop does and nothing re-picks on resize (the owner,
 * 2026-09-08).
 */
export function selectImage(entry: ImageEntry): string {
  return entry.variants[0]?.[1] ?? entry.full
}
