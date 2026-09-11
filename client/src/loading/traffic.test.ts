import { BackgroundTraffic } from './traffic'

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

test('visible work interrupts one background transfer and resumes priorities without parallel downloads', async () => {
  const requests: { url: string; signal: AbortSignal; finish: () => void }[] = []
  const original = global.fetch
  global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
    const signal = options!.signal as AbortSignal
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))
    requests.push({ url: String(url), signal, finish: () => resolve({ ok: true, blob: async () => new Blob() } as Response) })
  }))
  try {
    const queue = new BackgroundTraffic()
    const controller = new AbortController()
    const art = queue.request('/card.webp', 30, controller.signal)
    const nextMusic = queue.request('/part-1.mp3', 5, controller.signal)
    expect(requests.map((request) => request.url)).toEqual(['/card.webp'])
    const release = queue.foregroundRequest()
    expect(requests[0].signal.aborted).toBe(true)
    await flush()
    expect(requests).toHaveLength(1)
    release()
    expect(requests[1].url).toBe('/part-1.mp3')
    requests[1].finish()
    await flush()
    expect(requests[2].url).toBe('/card.webp')
    requests[2].finish()
    await Promise.all([art, nextMusic])
    expect(queue.busy).toBe(false)
  } finally { global.fetch = original }
})

test('changing screens cancels queued jobs before they can consume bandwidth', async () => {
  const queue = new BackgroundTraffic()
  queue.setEnabled(false)
  const controller = new AbortController()
  const job = queue.request('/optional.webp', 30, controller.signal)
  controller.abort()
  await expect(job).rejects.toMatchObject({ name: 'AbortError' })
  const original = global.fetch
  global.fetch = jest.fn()
  queue.setEnabled(true)
  expect(global.fetch).not.toHaveBeenCalled()
  global.fetch = original
})

test('interrupted media resumes with a byte range without duplicating downloaded bytes', async () => {
  const original = global.fetch
  const optionsSeen: RequestInit[] = []
  global.fetch = jest.fn(async (_url, options) => {
    optionsSeen.push(options!)
    const resumed = optionsSeen.length === 2
    let read = 0
    return {
      ok: true, status: resumed ? 206 : 200,
      headers: new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/mpeg', ETag: '"music-v1"', ...(resumed ? { 'Content-Range': 'bytes 2-3/4' } : {}) }),
      body: { getReader: () => ({
        releaseLock: jest.fn(),
        read: () => {
          if (read++ === 0) return Promise.resolve({ done: false, value: new Uint8Array(resumed ? [3, 4] : [1, 2]) })
          if (resumed) return Promise.resolve({ done: true })
          return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))))
        },
      }) },
    } as unknown as Response
  })
  try {
    const queue = new BackgroundTraffic()
    const music = queue.request('/music.mp3', 40, new AbortController().signal)
    await flush()
    const release = queue.foregroundRequest()
    await flush()
    expect(optionsSeen).toHaveLength(1)
    release()
    const blob = await music
    expect(optionsSeen[1].headers).toEqual({ Range: 'bytes=2-', 'If-Range': '"music-v1"' })
    expect(blob.size).toBe(4)
    expect(blob.type).toBe('audio/mpeg')
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(blob)
    })
    expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3, 4])
  } finally { global.fetch = original }
})
