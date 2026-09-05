import React, { useRef } from 'react'
import { assetUrl } from '../assetUrl'
import { useAudio } from './AudioProvider'
import './volume.css'

export default function VolumeControl() {
  const { volume, setVolume } = useAudio()
  const beforeMute = useRef(50)
  const mute = () => {
    if (volume > 0) { beforeMute.current = volume; setVolume(0) }
    else setVolume(beforeMute.current)
  }
  return (
    <div className="volume-control" title={`Sound volume: ${volume}%`} onClick={(event) => event.stopPropagation()}>
      <div className="volume-outline volume-sprite" aria-hidden="true">
        <img src={assetUrl('/music/Volume outline.png')} alt="" draggable={false} />
      </div>
      <div className="volume-track" aria-hidden="true">
        <div className="volume-fill volume-sprite" style={{ clipPath: `inset(0 ${100 - volume}% 0 0)` }}>
          <img src={assetUrl('/music/Volume Bar.png')} alt="" draggable={false} />
        </div>
      </div>
      <div className="volume-knob volume-sprite" aria-hidden="true" style={{ left: `${25.61 + 51.81 * volume / 100}%` }}>
        <img src={assetUrl('/music/Volume Knob.png')} alt="" draggable={false} />
      </div>
      <input className="volume-input" type="range" min="0" max="100" step="1" value={volume}
        aria-label="Sound volume" aria-valuetext={volume === 0 ? 'Muted' : `${volume}%`}
        onChange={(event) => setVolume(Number(event.target.value))} />
      <button className="volume-mute" type="button" aria-label={volume === 0 ? 'Unmute sound' : 'Mute sound'} aria-pressed={volume === 0} onClick={mute} />
      <button className="volume-increase" type="button" aria-label="Increase volume" disabled={volume === 100} onClick={() => setVolume(volume + 10)} />
      <output className="volume-value">{volume}%</output>
    </div>
  )
}
