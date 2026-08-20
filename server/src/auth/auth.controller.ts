import {
  Body,
  Controller,
  HttpException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import type { AuthSession } from './auth.service'
import {
  InvalidAuthInputError,
  InvalidCredentialsError,
  UsernameAlreadyExistsError,
} from './auth.errors'

export const SESSION_COOKIE_NAME = 'htsr_session'

type Credentials = {
  username: string
  password: string
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accountId: string; username: string }> {
    const credentials = parseCredentials(body)

    try {
      const session = await this.authService.register(
        credentials.username,
        credentials.password,
      )
      setSessionCookie(response, session)
      return publicAccount(session)
    } catch (error) {
      if (error instanceof UsernameAlreadyExistsError) {
        throw reasonException(HttpStatus.CONFLICT, 'Username already exists')
      }
      if (error instanceof InvalidAuthInputError) {
        throw reasonException(HttpStatus.BAD_REQUEST, error.message)
      }
      throw error
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accountId: string; username: string }> {
    const credentials = parseCredentials(body)

    try {
      const session = await this.authService.login(
        credentials.username,
        credentials.password,
      )
      setSessionCookie(response, session)
      return publicAccount(session)
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw reasonException(HttpStatus.UNAUTHORIZED, error.message)
      }
      if (error instanceof InvalidAuthInputError) {
        throw reasonException(HttpStatus.BAD_REQUEST, error.message)
      }
      throw error
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookie = request.cookies?.[SESSION_COOKIE_NAME]
    const token = typeof cookie === 'string' ? cookie : undefined

    await this.authService.logout(token)

    // Clear the browser cookie even when its server-side session is already gone.
    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions())
  }
}

// Private helpers

function parseCredentials(body: unknown): Credentials {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('username' in body) ||
    !('password' in body) ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string'
  ) {
    throw reasonException(
      HttpStatus.BAD_REQUEST,
      'Username and password are required',
    )
  }

  return { username: body.username, password: body.password }
}

function setSessionCookie(response: Response, session: AuthSession): void {
  response.cookie(SESSION_COOKIE_NAME, session.token, {
    ...sessionCookieOptions(),
    expires: session.expiresAt,
  })
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  }
}

function publicAccount(session: AuthSession) {
  return { accountId: session.accountId, username: session.username }
}

function reasonException(status: HttpStatus, reason: string): HttpException {
  return new HttpException({ reason }, status)
}
