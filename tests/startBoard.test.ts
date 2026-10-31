import { describe, expect, it } from 'vitest';
import { BOARD_H, BOARD_MOVE, BOARD_SIDEWAYS, BOARD_UP, BOARD_W, boardPose, WALK_TO } from '../src/core/startOfficial';

// The start board's path (Boss, 31 Oct 2026): raised, turned sideways and lowered at the same
// counts as before, without ever passing through the official, START 30 upright when first raised
// and turned anticlockwise to go sideways. In the official's own units, facing +z, as RaceView
// builds them: body and head within x ±0.21, z ±0.12, up to 1.45; raised hands up to 1.64.

/** A point on the board (u across, v up, from its centre) placed as three.js does: in-plane turn, then the flip, then the centre. */
function onBoard(p: ReturnType<typeof boardPose>, u: number, v: number): [number, number, number] {
  const x1 = u * Math.cos(p.side) - v * Math.sin(p.side);
  const y1 = u * Math.sin(p.side) + v * Math.cos(p.side);
  return [x1 * Math.cos(p.flip), p.y + y1, p.z - x1 * Math.sin(p.flip)];
}

function boardPoints(p: ReturnType<typeof boardPose>): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= 18; i++) for (let j = 0; j <= 14; j++) out.push(onBoard(p, (i / 18 - 0.5) * BOARD_W, (j / 14 - 0.5) * BOARD_H));
  return out;
}

const clocks: number[] = [];
for (let c = BOARD_UP - 0.5; c <= 0.5; c += 0.002) clocks.push(c);

describe('start board', () => {
  it('never passes through the official', () => {
    const hits: string[] = [];
    for (const c of clocks) {
      const p = boardPose(c);
      for (const [x, y, z] of boardPoints(p)) {
        const inBody = Math.abs(x) < 0.21 && y < 1.45 && Math.abs(z) < 0.12;
        // Arms up: nothing below the raised hands within their reach.
        const inHands = p.arms > 0.99 && Math.abs(x) < 0.32 && Math.abs(z) < 0.2 && y < 1.64;
        if (inBody || inHands) hits.push(`clock ${c.toFixed(3)} at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);
      }
    }
    expect(hits.slice(0, 5)).toEqual([]);
  });

  it('is low with the white side out, then raised face out and upright, at the same counts', () => {
    expect(boardPose(BOARD_UP - 1)).toMatchObject({ flip: Math.PI, side: 0, arms: 0 });
    const up = boardPose(BOARD_UP + BOARD_MOVE);
    expect(up.flip).toBe(0);
    expect(up.side).toBe(0);
    expect(up.arms).toBe(1);
    expect(boardPose(BOARD_SIDEWAYS - 0.01).side).toBe(0);
    expect(boardPose(WALK_TO + BOARD_MOVE)).toMatchObject({ flip: Math.PI, side: 0, arms: 0 });
    expect(boardPose(BOARD_UP + 1, false)).toMatchObject({ flip: Math.PI, arms: 0 });
  });

  it('turns sideways anticlockwise from the count, keeping its lowest corner above the hands', () => {
    const side = boardPose(BOARD_SIDEWAYS + 0.5);
    // A positive turn about the board's normal is anticlockwise as seen from in front (+z), where the riders are.
    expect(side.side).toBeCloseTo(Math.PI / 2);
    expect(side.flip).toBe(0);
    for (let c = BOARD_SIDEWAYS; c < WALK_TO; c += 0.01) {
      const lowest = Math.min(...boardPoints(boardPose(c)).map((q) => q[1]));
      expect(lowest).toBeGreaterThan(1.64);
    }
  });
});
