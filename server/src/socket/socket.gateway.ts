import { OnModuleInit } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { RuntimeService, SOLO_PLAYER_ID } from '../runtime/runtime.service'
import type { CreateGameOptions } from '../runtime/runtime.service'
import type { ActionDto, ModifierReactionDto } from '../runtime/runtime.types'

/**
 * Socket API for the solo game hosted by RuntimeService.
 *
 * Client → server:
 *   game:start     — restart with a fresh game
 *   game:action    — ActionDto (DrawCard / PlayHero / PlayItem / PlayMagic /
 *                    RollOnHero / AttackMonster)
 *   game:reaction  — ModifierReactionDto (play a modifier into the open window)
 *   game:skip      — resolve open reaction windows immediately
 *   game:endTurn   — end the current turn early
 *
 * Server → client:
 *   game:catalog   — full card catalog (static data, sent once per connection)
 *   game:state     — GameSnapshotDto (sent on connect and after every event)
 *   game:event     — GameEventDto (every engine event, for animations/log)
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class GameSocketGateway implements OnModuleInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  constructor(private readonly runtime: RuntimeService) {}

  onModuleInit(): void {
    this.runtime.subscribe((event) => {
      this.server.emit('game:event', event)
      this.server.emit('game:state', this.runtime.getSnapshot())
    })
    this.runtime.createGame()
  }

  handleConnection(client: Socket): void {
    client.emit('game:catalog', this.runtime.getCatalog())
    client.emit('game:state', this.runtime.getSnapshot())
  }

  @SubscribeMessage('game:sync')
  onSync(@ConnectedSocket() client: Socket): void {
    client.emit('game:catalog', this.runtime.getCatalog())
    client.emit('game:state', this.runtime.getSnapshot())
  }

  @SubscribeMessage('game:start')
  onStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() options?: CreateGameOptions,
  ): void {
    this.runtime.createGame(options ?? {})
    this.server.emit('game:catalog', this.runtime.getCatalog())
    this.server.emit('game:state', this.runtime.getSnapshot())
  }

  @SubscribeMessage('game:action')
  onAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ActionDto,
  ): void {
    // playerId override is a dev shortcut until sockets carry seat identity.
    this.runtime.performAction(dto.playerId ?? SOLO_PLAYER_ID, dto)
    this.server.emit('game:state', this.runtime.getSnapshot())
  }

  @SubscribeMessage('game:reaction')
  onReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ModifierReactionDto,
  ): void {
    this.runtime.submitModifier(SOLO_PLAYER_ID, dto)
    this.server.emit('game:state', this.runtime.getSnapshot())
  }

  @SubscribeMessage('game:skip')
  onSkip(): void {
    this.runtime.resolveOpenWindows()
    this.server.emit('game:state', this.runtime.getSnapshot())
  }

  @SubscribeMessage('game:endTurn')
  onEndTurn(): void {
    this.runtime.endTurn()
    this.server.emit('game:state', this.runtime.getSnapshot())
  }
}
