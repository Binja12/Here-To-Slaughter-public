import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { TargetingProvider, tkey, useTargetable, useTargeting } from './targeting'

/** A hand card as the board wires it: its key, its normal-mode click. */
function Card({ index, onActivate }: { index: number; onActivate: () => void }) {
  const t = useTargetable(tkey.handCard(index), onActivate)
  return (
    <div data-testid={`card-${index}`} data-mode={t.mode} className={t.className} onClick={t.onClick}>
      card {index}
    </div>
  )
}

function Ask({ onPick }: { onPick: (key: string) => void }) {
  const { begin } = useTargeting()
  return (
    <button
      onClick={() =>
        begin({
          source: tkey.pendingWindow('w1'),
          tone: 'choice',
          targets: [tkey.handCard(0), tkey.handCard(1)],
          live: [tkey.handCard(1)],
          onPick,
        })
      }
    >
      ask
    </button>
  )
}

describe('targeting: a reaction card kept live under a question', () => {
  it('keeps its normal look and click, and wins over being a target', () => {
    const onPick = jest.fn()
    const activate = [jest.fn(), jest.fn(), jest.fn()]
    render(
      <TargetingProvider>
        <Ask onPick={onPick} />
        {[0, 1, 2].map((i) => (
          <Card key={i} index={i} onActivate={activate[i]} />
        ))}
      </TargetingProvider>,
    )
    fireEvent.click(screen.getByText('ask'))

    expect(screen.getByTestId('card-0').dataset.mode).toBe('target')
    expect(screen.getByTestId('card-1').dataset.mode).toBe('live')
    expect(screen.getByTestId('card-2').dataset.mode).toBe('dimmed')
    expect(screen.getByTestId('card-1').className).toContain('live-aura')
    expect(screen.getByTestId('card-1').className).toContain('dim-exempt')

    // The live card starts its own action; the question is not answered by it.
    fireEvent.click(screen.getByTestId('card-1'))
    expect(activate[1]).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()

    // A target still answers.
    fireEvent.click(screen.getByTestId('card-0'))
    expect(onPick).toHaveBeenCalledWith(tkey.handCard(0), tkey.pendingWindow('w1'))
  })
})
