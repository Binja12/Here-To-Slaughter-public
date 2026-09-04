import React, { useEffect, useRef, useState } from 'react'
import type { Option } from './gameSettings'
import { px } from './lobbyLayout'

const GOLD = '#e7c268'
const GOLD_DIM = '#b99a53'
const INK = '#0b1526'

/**
 * One settings value in the ledger: a gold button that opens the list of
 * offered values under it. Drawn with the lobby's own colours rather than
 * a native <select>, whose popup ignores the stage's scale and theme.
 * Read-only (a seat that is not the host) shows the value as plain text.
 */
export default function Dropdown<T extends string | number | boolean>({
  value,
  options,
  onChange,
  editable,
  title,
}: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  editable: boolean
  title: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const label = current?.label ?? String(value)

  if (!editable) {
    return (
      <span className="truncate font-bold" title={title} style={{ fontSize: px(11.5), color: GOLD_DIM }}>
        {label}
      </span>
    )
  }

  return (
    <div ref={root} className="relative flex h-full w-full items-center justify-center">
      <button
        type="button"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="flex h-[78%] w-[92%] cursor-pointer items-center justify-between rounded-[0.3cqw] border px-[0.5cqw] font-bold transition-[filter] duration-150 hover:brightness-125"
        style={{
          fontSize: px(11.5),
          color: GOLD,
          borderColor: 'rgba(231,194,104,0.45)',
          background: 'rgba(11,21,38,0.55)',
        }}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden style={{ fontSize: px(8), marginLeft: px(4) }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-[4%] top-[92%] z-50 w-[92%] overflow-hidden rounded-[0.3cqw] border shadow-xl"
          style={{ background: INK, borderColor: 'rgba(231,194,104,0.6)' }}
        >
          {options.map((option) => {
            const selected = option.value === value
            return (
              <li
                key={String(option.value)}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return
                  setOpen(false)
                  if (!selected) onChange(option.value)
                }}
                className={`truncate px-[0.6cqw] py-[0.25cqw] ${
                  option.disabled ? 'cursor-default' : 'cursor-pointer hover:bg-amber-900/60'
                }`}
                style={{
                  fontSize: px(11),
                  color: option.disabled ? 'rgba(185,154,83,0.45)' : selected ? '#fff2c9' : GOLD,
                  fontWeight: selected ? 700 : 400,
                }}
              >
                {option.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
