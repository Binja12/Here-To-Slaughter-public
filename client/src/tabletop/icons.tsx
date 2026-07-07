import React from 'react'

// Hand-drawn inline SVG glyphs — original placeholder iconography, no
// external assets. Every icon is decorative; accessible names are provided
// by the surrounding component (tooltip / aria-label), never by color alone.

type IconProps = {
  size?: number
  color?: string
  className?: string
}

function Svg({
  size = 16,
  className,
  children,
  viewBox = '0 0 24 24',
}: IconProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const CLASS_COLORS: Record<string, string> = {
  Fighter: '#c05046',
  Guardian: '#d4a83b',
  Ranger: '#4d9257',
  Thief: '#8e5fb5',
  Wizard: '#4d7fc4',
  Bard: '#c87f3c',
}

export function classColor(heroClass?: string): string {
  return (heroClass && CLASS_COLORS[heroClass]) || '#9a8f7d'
}

/** Sword — Fighter */
export function FighterIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M12 2l2.2 2.2v8.3L12 14.7l-2.2-2.2V4.2L12 2z"
        fill={color}
      />
      <path d="M7.5 14.5h9v2h-9z" fill={color} />
      <path d="M11 16.5h2V21h-2z" fill={color} />
      <circle cx="12" cy="21.4" r="1.4" fill={color} />
    </Svg>
  )
}

/** Shield — Guardian */
export function GuardianIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M12 2l8 3v6.2c0 5.1-3.2 8.9-8 10.8-4.8-1.9-8-5.7-8-10.8V5l8-3z"
        fill={color}
      />
      <path
        d="M12 5.2l5 1.9v4.2c0 3.4-2 6-5 7.4V5.2z"
        fill="#00000033"
      />
    </Svg>
  )
}

/** Arrow — Ranger */
export function RangerIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M20 4l-1 6-2.1-2.1L7.3 17.5l1.6 1.6-2.4.8L4 21.4l.7-2.6.8-2.4 1.6 1.6 9.6-9.6L14.5 6l5.5-2z"
        fill={color}
      />
    </Svg>
  )
}

/** Dagger + mask — Thief */
export function ThiefIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M18.8 3.2c.8 2.8.1 5.4-1.9 7.4l-4.2 4.2-3.5-3.5 4.2-4.2c2-2 4.6-2.7 7.4-1.9h-2z"
        fill={color}
      />
      <path d="M8.2 12.3l3.5 3.5-1.4 1.4-1-1-2.8 2.8-1.5-1.5 2.8-2.8-1-1 1.4-1.4z" fill={color} />
      <circle cx="6" cy="19" r="1.6" fill={color} />
    </Svg>
  )
}

/** Star — Wizard */
export function WizardIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M12 2l2.4 6.1 6.6.4-5.1 4.2 1.7 6.4L12 15.5 6.4 19.1l1.7-6.4L3 8.5l6.6-.4L12 2z"
        fill={color}
      />
    </Svg>
  )
}

/** Music note — Bard */
export function BardIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M9.5 4l9-1.8v3.2l-7 1.4v9.4a3.3 3.3 0 1 1-2-3V4z"
        fill={color}
      />
      <circle cx="16" cy="16.8" r="2.6" fill={color} />
    </Svg>
  )
}

export function ClassIcon({
  heroClass,
  size = 16,
  color,
  className,
}: IconProps & { heroClass?: string }) {
  const c = color ?? classColor(heroClass)
  switch (heroClass) {
    case 'Fighter':
      return <FighterIcon size={size} color={c} className={className} />
    case 'Guardian':
      return <GuardianIcon size={size} color={c} className={className} />
    case 'Ranger':
      return <RangerIcon size={size} color={c} className={className} />
    case 'Thief':
      return <ThiefIcon size={size} color={c} className={className} />
    case 'Wizard':
      return <WizardIcon size={size} color={c} className={className} />
    case 'Bard':
      return <BardIcon size={size} color={c} className={className} />
    default:
      // "Any" requirement / unknown class — open circle
      return (
        <Svg size={size} className={className}>
          <circle cx="12" cy="12" r="8" stroke={c} strokeWidth="2.5" />
          <circle cx="12" cy="12" r="2.2" fill={c} />
        </Svg>
      )
  }
}

/** Crossed swords — turn emblem */
export function CrossedSwordsIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4 3l7.2 8.4-1.7 1.7L3 5.5 3 3h1z" fill={color} />
      <path d="M20 3h1v2.5L14.5 13l-1.7-1.7L20 3z" fill={color} />
      <path
        d="M8.3 14.5l1.2 1.2-3 3 .9.9-1.4 1.4-.9-.9-1.2 1.2-1.4-1.4 1.2-1.2-.9-.9L4.2 16l.9.9 3.2-2.4zM15.7 14.5l3.2 2.4.9-.9 1.4 1.4-.9.9 1.2 1.2-1.4 1.4-1.2-1.2-.9.9-1.4-1.4.9-.9-3-3 1.2-1.2z"
        fill={color}
      />
    </Svg>
  )
}

/** Skull — monsters / slain trophies */
export function SkullIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M12 2a8 8 0 0 0-8 8c0 2.8 1.4 5.2 3.5 6.6V20a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-3.4A8 8 0 0 0 12 2z"
        fill={color}
      />
      <circle cx="9" cy="10.5" r="2" fill="#00000088" />
      <circle cx="15" cy="10.5" r="2" fill="#00000088" />
      <path d="M12 12.5l1.3 2.7h-2.6L12 12.5z" fill="#00000088" />
      <path d="M10 18.5h1.2V21H10zM12.8 18.5H14V21h-1.2z" fill="#00000055" />
    </Svg>
  )
}

/** Trophy — slain-monster chips */
export function TrophyIcon({ size, color = 'currentColor', className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M7 3h10v2h3v2.5A4.5 4.5 0 0 1 15.7 12 5 5 0 0 1 13 13.9V17h3v2.5H8V17h3v-3.1A5 5 0 0 1 8.3 12 4.5 4.5 0 0 1 4 7.5V5h3V3z"
        fill={color}
      />
    </Svg>
  )
}

/** Single d6 face */
export function DieIcon({
  value,
  size = 40,
  className,
}: IconProps & { value?: number }) {
  const pips: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [[7.5, 7.5], [16.5, 16.5]],
    3: [[7, 7], [12, 12], [17, 17]],
    4: [[7.5, 7.5], [16.5, 7.5], [7.5, 16.5], [16.5, 16.5]],
    5: [[7.5, 7.5], [16.5, 7.5], [12, 12], [7.5, 16.5], [16.5, 16.5]],
    6: [[7.5, 6.5], [16.5, 6.5], [7.5, 12], [16.5, 12], [7.5, 17.5], [16.5, 17.5]],
  }
  const dots = value && pips[value] ? pips[value] : []
  return (
    <Svg size={size} className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#f3ead6" />
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="4.5"
        stroke="#00000040"
        strokeWidth="1"
      />
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.9" fill="#2b2118" />
      ))}
      {!value && (
        <path d="M12 8.6l2.6 3.4-2.6 3.4-2.6-3.4L12 8.6z" fill="#b09a6e" />
      )}
    </Svg>
  )
}
