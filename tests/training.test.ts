import { describe, expect, it } from 'vitest';
import { checkContent } from '../src/core/content';
import { newSkillState, childLevel } from '../src/core/skills';
import { GATE_EASE_LEVEL, GATE_WINDOW_MS, drillForAction, drillForNpc, drillsAtVenue, finishRound, gateHoldMs, gateStart, gateWindowMs, goodRep, onPace, walked } from '../src/core/training';
import { MotoSim, type Entrant } from '../src/core/race';
import { cpuEntrant } from '../src/core/raceDay';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { training, skills } = content;

describe('Fitness training (Boss, 29 Oct 2026)', () => {
  it('has the bodyweight drills on the exercise mat and the coach\'s running session', () => {
    const mat = drillForAction(training, 'train.bodyweight')!;
    expect(mat.skill).toBe('strength');
    expect(mat.game).toBe('reps');
    const run = drillForNpc(training, 'npc.running_coach')!;
    expect(run.skill).toBe('endurance');
    expect(run.game).toBe('pace');
    // The coach stands by the running track in Home Town, and the mat is in the rented room.
    expect(content.npcs.find((n) => n.id === 'npc.running_coach')!.map).toBe('area1-home-town');
    const room = loadMaps().get('int-home-rented-room')!;
    expect(room.objects.some((o) => o.props.action === 'train.bodyweight')).toBe(true);
  });

  it('gives a round its fixed XP whatever the score, at about Tier 1 pace (Spec 2.2)', () => {
    const s = newSkillState();
    for (const d of training.drills) {
      finishRound(skills, s, d);
      expect(s.xp[d.skill]).toBe(d.xp);
      const perHour = (d.xp * 3600000) / d.ms;
      expect(perHour).toBeGreaterThanOrEqual(3000);
      expect(perHour).toBeLessThanOrEqual(6000);
    }
    // Two rounds of bodyweight drills take Strength to level 2 (83 XP).
    finishRound(skills, s, drillForAction(training, 'train.bodyweight')!);
    expect(childLevel(skills, s, 'strength')).toBe(2);
  });

  it('gives Agility for walking, a little every few tiles', () => {
    const s = newSkillState();
    let carry = 0;
    for (let i = 0; i < 25; i++) carry = walked(training, skills, s, carry).carry;
    expect(s.xp.agility).toBe(2 * training.walk.xp);
    expect(carry).toBe(5);
  });

  it('scores reps in the green zone and pace in its band', () => {
    expect([0.1, 0.45, 0.5, 0.59, 0.9].map(goodRep)).toEqual([false, true, true, true, false]);
    expect([0.2, 0.6, 0.7, 0.9].map(onPace)).toEqual([false, true, true, false]);
  });

  it('Strength and Endurance cut lap time, never more than 3% between them, and nothing at level 1', () => {
    const track = content.tracks.tracks.find((t) => t.id === 'farmland')!;
    const def = content.riders.riders.find((r) => r.id === 'cpu.local_racer')!;
    const run = (fit: number) => {
      const e: Entrant = cpuEntrant(content, def, '50cc');
      e.skills = { ...e.skills, strength: fit, endurance: fit };
      const sim = new MotoSim(content.racing, content.bikes, track, '50cc', [e], { laps: 4, motoIndex: 0, seed: 9 });
      sim.runToEnd();
      return sim.results()[0].time;
    };
    const slow = run(1);
    const fit = run(99);
    expect(fit).toBeLessThan(slow);
    expect((slow - fit) / slow).toBeLessThan(0.03);
  });
});

describe('Gate drop drill (Areas 2 to 8 plan gap 2; Boss, 30 Oct 2026)', () => {
  it('is offered at the backyard loop, trains Starts and cannot be failed', () => {
    const drills = drillsAtVenue(training, 'backyard');
    expect(drills.map((d) => d.id)).toEqual(['train.gate_drop']);
    const drill = drills[0];
    expect(drill.skill).toBe('starts');
    expect(drill.game).toBe('react');
    expect(drillForAction(training, 'train.gate_drop')).toBeUndefined();
    const state = newSkillState();
    finishRound(skills, state, drill);
    expect(state.xp.starts).toBe(drill.xp);
  });

  it('a press before the drop is a jumped start, in the window a good one, after it slow', () => {
    expect(gateStart(-1, 1)).toBe('jumped');
    expect(gateStart(0, 1)).toBe('good');
    expect(gateStart(GATE_WINDOW_MS, 1)).toBe('good');
    expect(gateStart(GATE_WINDOW_MS + 1, 1)).toBe('slow');
  });

  it('only gets easier, as if the gate dropped slower, from Starts 70 on', () => {
    expect(gateWindowMs(1)).toBe(GATE_WINDOW_MS);
    expect(gateWindowMs(GATE_EASE_LEVEL - 1)).toBe(GATE_WINDOW_MS);
    expect(gateWindowMs(GATE_EASE_LEVEL)).toBeGreaterThan(GATE_WINDOW_MS);
    expect(gateWindowMs(99)).toBeGreaterThan(gateWindowMs(GATE_EASE_LEVEL));
    expect(gateStart(GATE_WINDOW_MS + 1, 99)).toBe('good');
  });

  it('holds the gate a random 1.5 to 4.5 seconds so the drop cannot be timed', () => {
    expect(gateHoldMs(() => 0)).toBe(1500);
    expect(gateHoldMs(() => 0.999)).toBeLessThan(4500);
  });
});
