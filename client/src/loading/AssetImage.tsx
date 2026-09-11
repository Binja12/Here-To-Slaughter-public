import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { assetUrl } from '../assetUrl'
import { catalog, selectImage, sourcePath } from './catalog'
import { backgroundTraffic } from './traffic'

const failed = new Set<string>()
const listeners = new Set<() => void>()
let revision = 0
const notify = () => { revision++; listeners.forEach((listener) => listener()) }
// Only a FAILED url changes what an image resolves to now — the export does
// not depend on the viewport, so nothing re-picks on resize.
const snapshot = () => String(revision)
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function imageUrl(source: string): string {
  const entry = catalog.images[sourcePath(source)]
  if (!entry) return assetUrl(source)
  return [selectImage(entry), entry.full, assetUrl(source)]
    .find((url) => !failed.has(url)) ?? assetUrl(source)
}

function failedImage(url: string) {
  if (!failed.has(url)) { failed.add(url); notify() }
}

export function useImageUrl(source: string) {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return imageUrl(source)
}

export function useBackgroundImage(source: string) {
  const url = useImageUrl(source)
  useLayoutEffect(() => {
    const image = new Image()
    const done = backgroundTraffic.foregroundRequest()
    image.onload = done
    image.onerror = () => { done(); failedImage(url) }
    image.src = url
    if (image.complete) done()
    return () => { image.onload = null; image.onerror = null; done() }
  }, [url])
  return url
}

export default function AssetImage({ src = '', alt = '', onLoad, onError, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const url = useImageUrl(src)
  const ref = useRef<HTMLImageElement>(null)
  const finish = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    if (ref.current?.complete) return
    const done = backgroundTraffic.foregroundRequest()
    finish.current = done
    return done
  }, [url])
  return <img {...props} ref={ref} src={url} alt={alt} decoding="async"
    onLoad={(event) => { finish.current(); onLoad?.(event) }}
    onError={(event) => { finish.current(); failedImage(url); onError?.(event) }} />
}
