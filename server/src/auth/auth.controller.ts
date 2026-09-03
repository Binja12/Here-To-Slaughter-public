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
import type { AuthSession } from './auth.types'
import {
  InvalidAuthInputError,
  InvalidCredentialsError,
  UsernameAlreadyExistsError,
} from './auth.errors'
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from './session-cookie'

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
    await this.authService.logout(readSessionToken(request))

    // Clear the browser cookie even when its server-side session is already gone.
    clearSessionCookie(response)
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

function publicAccount(session: AuthSession) {
  return { accountId: session.accountId, username: session.username }
}

function reasonException(status: HttpStatus, reason: string): HttpException {
  return new HttpException({ reason }, status)
}
