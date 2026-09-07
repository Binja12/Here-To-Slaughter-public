type Job = {
  url: string; priority: number; signal: AbortSignal
  resolve: (blob: Blob) => void; reject: (error: unknown) => void
  chunks?: ArrayBuffer[]; received?: number; mime?: string; etag?: string
}

// Only speculative/background work enters this queue. Browser-discovered
// visible images and API/socket traffic retain their normal foreground path.
export class BackgroundTraffic {
  private jobs: Job[] = []
  private active: { job: Job; controller: AbortController } | null = null
  private foreground = 0
  private enabled = true
  private idleListeners = new Set<() => void>()

  get busy() { return this.foreground > 0 || !this.enabled }

  onIdle(listener: () => void) {
    this.idleListeners.add(listener)
    return () => { this.idleListeners.delete(listener) }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.changed()
  }

  foregroundRequest() {
    this.foreground++
    this.changed()
    let finished = false
    return () => {
      if (finished) return
      finished = true
      this.foreground--
      this.changed()
    }
  }

  request(url: string, priority: number, signal: AbortSignal): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
      const job = { url, priority, signal, resolve, reject }
      const cancel = () => {
        this.jobs = this.jobs.filter((pending) => pending !== job)
        if (this.active?.job === job) this.active.controller.abort()
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      signal.addEventListener('abort', cancel, { once: true })
      job.resolve = (blob) => { signal.removeEventListener('abort', cancel); resolve(blob) }
      job.reject = (error) => { signal.removeEventListener('abort', cancel); reject(error) }
      this.jobs.push(job)
      this.pump()
    })
  }

  private changed() {
    if (this.busy) this.active?.controller.abort()
    else {
      this.idleListeners.forEach((listener) => listener())
      this.pump()
    }
  }

  private pump() {
    if (this.busy || this.active) return
    this.jobs.sort((a, b) => a.priority - b.priority)
    const job = this.jobs.shift()
    if (!job) return
    const controller = new AbortController()
    this.active = { job, controller }
    const options: RequestInit & { priority: string } = {
      signal: controller.signal, cache: 'force-cache', priority: 'low',
    }
    if (job.received) options.headers = {
      Range: `bytes=${job.received}-`, ...(job.etag && !job.etag.startsWith('W/') ? { 'If-Range': job.etag } : {}),
    }
    fetch(job.url, options).then(async (response) => {
      if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${job.url}`)
      const partial = response.status === 206
      if (partial && !response.headers.get('Content-Range')?.startsWith(`bytes ${job.received ?? 0}-`)) {
        throw new Error(`Unexpected asset byte range: ${job.url}`)
      }
      if (!partial) {
        job.chunks = []
        job.received = 0
        job.mime = response.headers?.get('Content-Type') ?? ''
        job.etag = response.headers?.get('ETag') ?? undefined
      }
      // nginx advertises byte ranges for media. Preserve completed bytes across
      // foreground interruptions; compressed HTTP responses cannot use these offsets.
      if (!response.body || (!partial && response.headers?.get('Accept-Ranges') !== 'bytes') || response.headers?.get('Content-Encoding')) return response.blob()
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          job.chunks!.push(value.slice().buffer)
          job.received = (job.received ?? 0) + value.byteLength
        }
      } finally { reader.releaseLock() }
      return new Blob(job.chunks, { type: job.mime })
    }).then(job.resolve).catch((error) => {
      if (controller.signal.aborted && !job.signal.aborted) this.jobs.unshift(job)
      else job.reject(error)
    }).finally(() => {
      this.active = null
      this.pump()
    })
  }
}

export const backgroundTraffic = new BackgroundTraffic()
