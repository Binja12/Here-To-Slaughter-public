import type { CookieOptions, Request, Response } from 'express'
import type { AuthSession } from './auth.types'

export const SESSION_COOKIE_NAME = 'htsr_session'

export function readSessionToken(request: Request): string | undefined {
  const cookie = request.cookies?.[SESSION_COOKIE_NAME]
  return typeof cookie === 'string' ? cookie : undefined
}

export function setSessionCookie(
  response: Response,
  session: AuthSession,
): void {
  // Add the opaque token to the response without exposing it to browser scripts.
  response.cookie(SESSION_COOKIE_NAME, session.token, {
    ...sessionCookieOptions(),
    expires: session.expiresAt,
  })
}

export function clearSessionCookie(response: Response): void {
  // Use the same path and security settings as the original cookie.
  response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions())
}

function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  }
}
