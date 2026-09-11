import { describe, expect, it } from 'vitest';
import { isClosingSwipe } from './swipe';

describe('isClosingSwipe', () => {
  it('accepts a deliberate leftward swipe', () => {
    expect(isClosingSwipe({ x: 220, y: 100 }, { x: 120, y: 112 })).toBe(true);
  });

  it('rejects short, rightward, and mostly vertical gestures', () => {
    expect(isClosingSwipe({ x: 220, y: 100 }, { x: 170, y: 100 })).toBe(false);
    expect(isClosingSwipe({ x: 120, y: 100 }, { x: 220, y: 100 })).toBe(false);
    expect(isClosingSwipe({ x: 220, y: 100 }, { x: 150, y: 180 })).toBe(false);
  });
});
