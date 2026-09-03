import React, { FormEvent, useState } from 'react'
import type { LobbyPort } from '../ports/LobbyPort'
import { LobbyPortError } from '../ports/LobbyPort'

export default function AuthView({
  port,
  onAuthenticated,
}: {
  port: LobbyPort
  onAuthenticated: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('Player One')
  const [password, setPassword] = useState('slaughter')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const credentials = { username, password }
      if (mode === 'login') await port.login(credentials)
      else await port.register(credentials)
      onAuthenticated()
    } catch (cause) {
      setError(cause instanceof LobbyPortError ? cause.reason : 'Authentication failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#120d0a] p-6 font-body text-amber-50">
      <section className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-zinc-950/90 p-8 shadow-2xl shadow-black">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-500">Here to Slaughter</p>
        <h1 className="mt-2 font-heading text-4xl text-amber-200">
          {mode === 'login' ? 'Enter the tavern' : 'Join the party'}
        </h1>

        <div className="mt-7 grid grid-cols-2 rounded-lg border border-amber-800 bg-black/30 p-1">
          {(['login', 'register'] as const).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => {
                setMode(next)
                setError(null)
              }}
              className={`rounded-md px-4 py-2 font-heading uppercase tracking-wider ${
                mode === next ? 'bg-amber-700 text-white' : 'text-amber-300 hover:bg-amber-950'
              }`}
            >
              {next}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm text-amber-200">
            Username
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-700/60 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="block text-sm text-amber-200">
            Password
            <input
              required
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-700/60 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          {error && (
            <p role="alert" className="rounded border border-red-700/60 bg-red-950/50 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          <button
            disabled={submitting}
            className="w-full rounded-lg bg-amber-700 px-4 py-3 font-heading text-lg uppercase tracking-widest text-white hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>
      </section>
    </main>
  )
}
