import AssetImage from '../loading/AssetImage'
import React from 'react'
import { boardModifierUrl } from './assets'

/** One value of a pick, drawn as that value's modifier card (`Modifier +1.png`). */
export default function ValueArt({ value }: { value: number }) {
  const sign = `${value > 0 ? '+' : ''}${value}`
  return (
    <AssetImage
      src={boardModifierUrl(sign)}
      alt={sign}
      draggable={false}
      className="h-[25cqh] rounded-[.35cqw] object-contain shadow-xl"
    />
  )
}
