import React, { createContext, useContext } from 'react'
import type { CommandResult, GameCommandInput } from '../contract'

export type SendCommand = (command: GameCommandInput) => Promise<CommandResult>

const unavailableSend: SendCommand = async () => ({
  accepted: false,
  error: 'InternalError',
})

const CommandContext = createContext<SendCommand>(unavailableSend)

export function CommandProvider({
  send,
  children,
}: {
  send: SendCommand
  children: React.ReactNode
}) {
  return React.createElement(CommandContext.Provider, { value: send }, children)
}

export const useSend = () => useContext(CommandContext)
