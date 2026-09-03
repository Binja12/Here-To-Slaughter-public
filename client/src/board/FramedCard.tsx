import React from 'react';
import { heroCardUrl, heroClassOf } from './assets';

/**
 * A hero/party card composited in TWO layers, both filling the exact same
 * box (same size + coordinates):
 *   - layer 1 (behind): the card art scan
 *   - layer 2 (above):  the ornate class frame PNG (transparent windows let
 *                       the art show through; gold border sits on top)
 *
 * The frame image defines the box's aspect ratio, so the border lines up
 * pixel-for-pixel; the card behind is stretched to the same rectangle.
 * One frame per hero class (all 1086x1448), keyed by the shared HeroClass
 * enum value (case-insensitive).
 */

// Native aspect ratio of the supplied frame art (width / height).
const FRAME_ASPECT = 1086 / 1448;

const CLASS_FRAMES: Record<string, string> = {
  fighter: '/board/frame-fighter.png',
  guardian: '/board/frame-guardian.png',
  ranger: '/board/frame-ranger.png',
  thief: '/board/frame-thief.png',
  wizard: '/board/frame-wizard.png',
  bard: '/board/frame-bard.png',
};

export default function FramedCard({
  slug,
  heroClass,
  className = '',
}: {
  slug: string;
  /**
   * shared HeroClass enum value, e.g. "Ranger" (case-insensitive).
   * Defaults to the class recorded in the asset manifest for the slug.
   */
  heroClass?: string;
  className?: string;
}) {
  const frame = CLASS_FRAMES[(heroClass ?? heroClassOf(slug)).toLowerCase()];
  return (
    <div
      className={`relative select-none ${className}`}
      style={{ aspectRatio: String(FRAME_ASPECT) }}
    >
      {/* layer 1 — card art behind, filling the same box */}
      <img
        src={heroCardUrl(slug)}
        alt={slug}
        draggable={false}
        className="absolute inset-0 h-full w-full object-fill"
      />
      {/* layer 2 — ornate frame above, identical size + coordinates */}
      {frame && (
        <img
          src={frame}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-fill"
        />
      )}
    </div>
  );
}
