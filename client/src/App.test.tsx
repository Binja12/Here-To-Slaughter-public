import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { slainMonsterSlot } from './board/Board';

const mockRect = (
  element: Element,
  left: number,
  top: number,
  right: number,
  bottom: number,
) => {
  element.getBoundingClientRect = () =>
    ({
      x: left,
      y: top,
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      toJSON: () => ({}),
    }) as DOMRect;
};

test('renders the demo slain monsters attached to p1 and p2 leaders', () => {
  render(<App />);
  expect(screen.getByAltText('Dark Dragon King, slain monster')).toBeInTheDocument();
  expect(screen.getByAltText('Crowned Serpent, slain monster')).toBeInTheDocument();
  expect(screen.getByAltText('Arctic Aries, slain monster')).toBeInTheDocument();
  expect(screen.getByAltText('Bloodwing, slain monster')).toBeInTheDocument();
});

test('the modifier targets only p2 last slain monster', () => {
  const { container } = render(<App />);
  const modifier = screen.getByAltText('hand card 4');
  expect(modifier).toHaveAttribute(
    'src',
    '/board/Modifiers/Modifier +4.png',
  );

  fireEvent.click(modifier);

  expect(container.querySelector('.board-root')).toHaveClass('targeting');
  expect(screen.getByAltText('Bloodwing, slain monster').parentElement).toHaveClass(
    'target-aura',
  );
  expect(
    screen.getByAltText('Arctic Aries, slain monster').parentElement,
  ).not.toHaveClass('target-aura');
  expect(screen.getAllByAltText('monster')[1]).not.toHaveClass('target-aura');
});

test('the challenge card targets challengeable plays, not modifier rolls', () => {
  const { container } = render(<App />);
  const challenge = screen.getByAltText('hand card 5');
  expect(challenge).toHaveAttribute(
    'src',
    '/board/challenge/Challenge Basic.png',
  );

  fireEvent.click(challenge);

  expect(container.querySelector('.board-root')).toHaveClass('targeting');
  expect(screen.getAllByAltText('monster')[1]).toHaveClass('target-aura');
  expect(
    screen.getByAltText('Bloodwing, slain monster').parentElement,
  ).not.toHaveClass('target-aura');
});

test('more than three slain monsters overlap within three full-card slots', () => {
  expect(Array.from({ length: 5 }, (_, i) => slainMonsterSlot(i, 5))).toEqual([
    1,
    1.5,
    2,
    2.5,
    3,
  ]);
});

test('hero hover stays open while the cursor is over its attached item', () => {
  jest.useFakeTimers();
  render(<App />);
  const heroLayer = screen.getByAltText('fuzzy-cheeks').parentElement!;
  const itemLayer = screen.getByAltText('Really Big Ring').parentElement!;
  mockRect(heroLayer, 0, 0, 100, 100);
  mockRect(itemLayer, 100, 0, 200, 100);

  fireEvent.mouseEnter(heroLayer);
  act(() => jest.advanceTimersByTime(101));
  fireEvent.mouseLeave(heroLayer);
  fireEvent.mouseMove(document, { clientX: 150, clientY: 50 });

  expect(heroLayer.style.transform).toContain('scale');
  fireEvent.mouseMove(document, { clientX: 250, clientY: 150 });
  expect(heroLayer.style.transform).toBe('');
  jest.useRealTimers();
});

test('leader hover stays open while the cursor is over a slain monster', () => {
  jest.useFakeTimers();
  render(<App />);
  const monsterLayer = screen.getByAltText(
    'Dark Dragon King, slain monster',
  ).parentElement!;
  const leaderLayer = monsterLayer.parentElement!.querySelector(
    'img[alt="party leader"]',
  )!.parentElement!;
  mockRect(leaderLayer, 0, 0, 100, 100);
  mockRect(monsterLayer, 100, 0, 200, 100);

  fireEvent.mouseEnter(leaderLayer);
  act(() => jest.advanceTimersByTime(101));
  fireEvent.mouseLeave(leaderLayer);
  fireEvent.mouseMove(document, { clientX: 150, clientY: 50 });

  expect(leaderLayer.style.transform).toContain('scale');
  fireEvent.mouseMove(document, { clientX: 250, clientY: 150 });
  expect(leaderLayer.style.transform).toBe('');
  jest.useRealTimers();
});
