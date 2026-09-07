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

export function deliveryPixelHeight() {
  return deliverySettings.stagePixelHeight ?? stagePixelHeight()
}

export function selectImage(entry: ImageEntry, stagePixels: number): string {
  return entry.variants.find(([height]) => height >= stagePixels)?.[1] ?? entry.full
}

export function stagePixelHeight() {
  return Math.min(window.innerHeight, window.innerWidth * 9 / 16) * (window.devicePixelRatio || 1)
}
