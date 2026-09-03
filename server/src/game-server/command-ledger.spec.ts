import { RefusalReason } from 'shared'
import type { CommandResult } from 'shared'
import { CommandLedger } from './command-ledger'

const accepted = (commandId: string): CommandResult => ({
  commandId,
  accepted: true,
})

describe('CommandLedger', () => {
  let ledger: CommandLedger

  beforeEach(() => {
    ledger = new CommandLedger()
  })

  it('answers a remembered command id with what it was told, per seat', () => {
    const refusal: CommandResult = {
      commandId: 'c1',
      accepted: false,
      reason: RefusalReason.NotYourTurn,
    }
    ledger.remember('game:alice', 'c1', accepted('c1'))
    ledger.remember('game:bob', 'c1', refusal)

    expect(ledger.recall('game:alice', 'c1')).toEqual(accepted('c1'))
    expect(ledger.recall('game:bob', 'c1')).toEqual(refusal)
    expect(ledger.recall('game:alice', 'c2')).toBeUndefined()
    expect(ledger.recall('game:carol', 'c1')).toBeUndefined()
  })

  it('forgets a seat whole, and nobody else', () => {
    ledger.remember('game:alice', 'c1', accepted('c1'))
    ledger.remember('game:bob', 'c1', accepted('c1'))

    ledger.forget('game:alice')

    expect(ledger.recall('game:alice', 'c1')).toBeUndefined()
    expect(ledger.recall('game:bob', 'c1')).toEqual(accepted('c1'))
  })

  it('forgets the oldest answers of a seat once it holds more than 64', () => {
    for (let i = 0; i < 65; i++) {
      ledger.remember('game:alice', `c${i}`, accepted(`c${i}`))
    }

    expect(ledger.recall('game:alice', 'c0')).toBeUndefined()
    expect(ledger.recall('game:alice', 'c1')).toEqual(accepted('c1'))
    expect(ledger.recall('game:alice', 'c64')).toEqual(accepted('c64'))
  })
})
