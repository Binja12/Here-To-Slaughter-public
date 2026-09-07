import React, { useEffect, useState } from 'react'

export default function PendingCommandNotice({ since }: { since: number | null }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (since === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [since])
  if (since === null || now - since < 1000) return null
  return <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[500] border-b border-amber-500 bg-zinc-950/95 px-4 py-3 text-center text-sm text-amber-100">
    Waiting for the server’s reply… {Math.floor((now - since) / 1000)}s. Wait for confirmation before making another move.
  </div>
}
