import { backgroundTraffic } from '../loading/traffic'
import { MUSIC_SECONDS, type MusicSegment } from '../loading/catalog'

type BufferedPart = { audio: HTMLAudioElement; index: number; objectUrl?: string }

// Own at most the current part and one upcoming part. The provider controls
// gameplay/challenge crossfades; this class controls joins within one playlist.
export class MusicTrack {
  private active: BufferedPart
  private next: BufferedPart | null = null
  private pending: AbortController | null = null
  private initial: { controller: AbortController; promise: Promise<void> } | null = null
  private wanted = false
  private disposed = false
  private gain = 0
  private fade: ReturnType<typeof setInterval> | null = null
  private boundary: ReturnType<typeof setTimeout> | null = null
  private fadeProgress = 0
  private joinId = 0
  private joining = false
  private usingFallback = false
  private muted = false
  private retryAt = 0

  constructor(private parts: MusicSegment[], private fallback: string) {
    this.active = this.create(0)
    this.bindActive()
  }

  private create(index: number): BufferedPart {
    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = 0
    audio.loop = this.parts.length === 1
    return { audio, index }
  }

  get paused() { return this.active.audio.paused }
  get currentTime() { return this.active.audio.currentTime }
  set currentTime(value: number) {
    this.cancelJoin()
    if (value === 0 && this.active.index !== 0) {
      this.release(this.active)
      this.active = this.create(0)
      this.bindActive()
      this.clearNext()
    }
    this.active.audio.currentTime = value
    if (this.wanted && this.gain > 0) void this.play().catch(() => {})
  }
  set volume(value: number) {
    this.gain = value
    this.applyVolume()
  }
  get volume() { return this.gain }

  setMuted(muted: boolean) {
    if (this.muted === muted) return
    this.muted = muted
    if (muted) {
      this.cancelJoin()
      this.active.audio.pause()
      this.next?.audio.pause()
      this.pending?.abort()
      this.pending = null
      this.initial?.controller.abort()
      this.initial = null
    } else if (this.wanted && this.active.audio.paused && !backgroundTraffic.busy) {
      void this.play().catch(() => {})
    }
  }

  async play() {
    this.wanted = true
    if (this.disposed || this.muted || document.hidden) return
    const part = this.active
    const audio = part.audio
    if (!audio.getAttribute('src')) {
      if (this.usingFallback) audio.src = this.fallback
      else {
        if (!this.initial) {
          const controller = new AbortController()
          const promise = backgroundTraffic.request(this.parts[part.index].url, 40, controller.signal).then((blob) => {
            if (controller.signal.aborted || this.disposed || this.active !== part) return
            part.objectUrl = URL.createObjectURL(blob)
            audio.src = part.objectUrl
          }).finally(() => { if (this.initial?.controller === controller) this.initial = null })
          this.initial = { controller, promise }
        }
        try { await this.initial.promise } catch (error) {
          if ((error as Error).name !== 'AbortError') this.useFallback()
          throw error
        }
      }
    }
    if (!this.wanted || this.disposed || this.muted || document.hidden || this.active !== part || !audio.getAttribute('src')) return
    await audio.play()
    if (!this.wanted || this.disposed || document.hidden || this.muted) { audio.pause(); return }
    this.prepareNext()
    this.scheduleJoin()
  }

  pause() {
    this.wanted = false
    this.cancelJoin()
    this.active.audio.pause()
    this.next?.audio.pause()
    this.pending?.abort()
    this.pending = null
    this.initial?.controller.abort()
    this.initial = null
  }

  dispose() {
    this.disposed = true
    this.pause()
    this.clearNext()
    this.release(this.active)
  }

  private release(part: BufferedPart) {
    part.audio.onended = null
    part.audio.ontimeupdate = null
    part.audio.onloadedmetadata = null
    part.audio.onerror = null
    part.audio.pause()
    part.audio.removeAttribute('src')
    part.audio.load()
    if (part.objectUrl) URL.revokeObjectURL(part.objectUrl)
  }

  private clearNext() {
    this.pending?.abort()
    this.pending = null
    if (this.next) this.release(this.next)
    this.next = null
  }

  private applyVolume() {
    this.active.audio.volume = this.gain * (1 - this.fadeProgress)
    if (this.next) this.next.audio.volume = this.gain * this.fadeProgress
  }

  private cancelJoin() {
    this.joinId++
    this.joining = false
    if (this.fade !== null) clearInterval(this.fade)
    if (this.boundary !== null) clearTimeout(this.boundary)
    this.fade = null
    this.boundary = null
    this.fadeProgress = 0
    if (this.next) { this.next.audio.pause(); this.next.audio.currentTime = 0 }
    this.applyVolume()
  }

  private bindActive() {
    this.applyVolume()
    this.active.audio.ontimeupdate = () => {
      // The original-file fallback must obey the same trial playback limit.
      if (this.usingFallback && this.active.audio.currentTime >= MUSIC_SECONDS) this.active.audio.currentTime = 0
      this.prepareNext(); this.scheduleJoin()
    }
    this.active.audio.onloadedmetadata = () => this.scheduleJoin()
    this.active.audio.onerror = () => this.useFallback()
    this.active.audio.onended = () => {
      if (!this.wanted || document.hidden || this.gain === 0) return
      if (this.next) void this.join()
      else {
        // A slow connection should not stop the soundtrack or the match.
        this.active.audio.currentTime = 0
        void this.play().catch(() => {})
      }
    }
  }

  private prepareNext() {
    if (this.parts.length < 2 || this.next || this.pending || !this.wanted || this.muted || this.gain === 0 || document.hidden || Date.now() < this.retryAt) return
    // Leave early-match bandwidth for cards and the current audio stream.
    const duration = Number.isFinite(this.active.audio.duration)
      ? this.active.audio.duration : this.parts[this.active.index].durationSeconds
    if (duration - this.active.audio.currentTime > Math.min(90, duration / 2)) return
    const index = (this.active.index + 1) % this.parts.length
    const controller = new AbortController()
    this.pending = controller
    void backgroundTraffic.request(this.parts[index].url, 5, controller.signal).then((blob) => {
      if (controller.signal.aborted || this.disposed) return
      const next = this.create(index)
      next.objectUrl = URL.createObjectURL(blob)
      next.audio.src = next.objectUrl
      next.audio.preload = 'auto'
      next.audio.load()
      this.next = next
      this.scheduleJoin()
    }).catch(() => {
      if (!controller.signal.aborted) this.retryAt = Date.now() + 10000
    }).finally(() => { if (this.pending === controller) this.pending = null })
  }

  private scheduleJoin() {
    if (this.boundary !== null) clearTimeout(this.boundary)
    this.boundary = null
    if (!this.next || !this.wanted || this.active.audio.paused || this.joining) return
    const duration = this.active.audio.duration
    if (!Number.isFinite(duration)) return
    const remaining = duration - this.active.audio.currentTime
    // Prepare a short overlap before the MP3 endpoint, without a second network
    // fetch: the upcoming audio element reads the queue's completed Blob.
    this.boundary = setTimeout(() => { void this.join() }, Math.max(0, (remaining - 0.15) * 1000))
  }

  private async join() {
    const next = this.next
    if (!next || this.joining || !this.wanted || this.gain === 0 || document.hidden) return
    this.joining = true
    const id = ++this.joinId
    try {
      await next.audio.play()
      if (id !== this.joinId || this.disposed || !this.wanted) { next.audio.pause(); return }
      const started = Date.now()
      this.fade = setInterval(() => {
        this.fadeProgress = Math.min(1, (Date.now() - started) / 150)
        this.applyVolume()
        if (this.fadeProgress < 1) return
        if (this.fade !== null) clearInterval(this.fade)
        this.fade = null
        this.release(this.active)
        this.active = next
        this.next = null
        this.fadeProgress = 0
        this.joining = false
        this.applyVolume()
        this.bindActive()
        this.prepareNext()
      }, 16)
    } catch {
      this.joining = false
      this.clearNext()
      this.retryAt = Date.now() + 10000
      if (this.active.audio.ended) {
        this.active.audio.currentTime = 0
        void this.active.audio.play().catch(() => {})
      }
    }
  }

  private useFallback() {
    if (this.usingFallback || this.disposed) return
    this.usingFallback = true
    this.initial?.controller.abort()
    this.initial = null
    const position = this.parts[this.active.index].startSeconds + this.active.audio.currentTime
    this.cancelJoin()
    this.clearNext()
    this.parts = [{ url: this.fallback, startSeconds: 0, durationSeconds: 0 }]
    this.release(this.active)
    this.active = this.create(0)
    this.bindActive()
    this.active.audio.onloadedmetadata = () => {
      this.active.audio.currentTime = position % MUSIC_SECONDS
      if (this.wanted) void this.play().catch(() => {})
    }
    if (this.wanted) void this.play().catch(() => {})
  }
}
