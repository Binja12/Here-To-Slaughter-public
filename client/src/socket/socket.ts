import { io, Socket } from 'socket.io-client'

const SERVER_URL = process.env.REACT_APP_SERVER_URL ?? 'http://localhost:3000'

export const socket: Socket = io(SERVER_URL, {
  transports: ['websocket'],
  autoConnect: true,
})
