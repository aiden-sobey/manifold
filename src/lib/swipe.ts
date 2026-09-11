interface Point {
  x: number;
  y: number;
}

const MIN_CLOSE_DISTANCE = 64;
const HORIZONTAL_DOMINANCE = 1.25;

/** A deliberate leftward swipe, distinct from short taps and vertical scrolling. */
export function isClosingSwipe(start: Point, end: Point): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx <= -MIN_CLOSE_DISTANCE && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE;
}
