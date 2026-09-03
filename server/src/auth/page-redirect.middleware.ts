import { Inject, Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { GAME_ASSIGNMENT_STORE } from '../lobby/lobby.interfaces'
import type { IGameAssignmentStore } from '../lobby/lobby.interfaces'
import { AuthService } from './auth.service'
import { readSessionToken } from './session-cookie'

const LOGIN_PATH = '/login'
const LOBBY_PATH = '/lobby'
const GAME_PATH_PREFIX = '/game/'

@Injectable()
export class PageRedirectMiddleware implements NestMiddleware {
  constructor(
    private readonly authService: AuthService,
    @Inject(GAME_ASSIGNMENT_STORE)
    private readonly assignments: IGameAssignmentStore,
  ) {}

  async use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    // API calls keep their normal status codes; redirects apply to page navigation.
    if (!acceptsHtml(request)) return next()

    const path = request.originalUrl.split('?', 1)[0]
    const account = await this.authService.resolveAccount(
      readSessionToken(request),
    )
    const assignment = account
      ? await this.assignments.findByAccountId(account.accountId)
      : undefined

    if (path === LOGIN_PATH) {
      // Logged-in users should not return to the login page.
      if (!account) return next()
      return redirect(
        response,
        assignment ? gamePath(assignment.gameId) : LOBBY_PATH,
      )
    }

    // Every application page except login requires an authenticated session.
    if (!account) return redirect(response, LOGIN_PATH)

    // An account with an active game always returns to that game's page.
    if (assignment && path !== gamePath(assignment.gameId)) {
      return redirect(response, gamePath(assignment.gameId))
    }

    // A player without an assignment cannot enter a game URL.
    if (!assignment && path.startsWith(GAME_PATH_PREFIX)) {
      return redirect(response, LOBBY_PATH)
    }

    next()
  }
}

function acceptsHtml(request: Request): boolean {
  return request.headers.accept?.includes('text/html') ?? false
}

function gamePath(gameId: string): string {
  return `${GAME_PATH_PREFIX}${encodeURIComponent(gameId)}`
}

function redirect(response: Response, path: string): void {
  response.redirect(302, path)
}
