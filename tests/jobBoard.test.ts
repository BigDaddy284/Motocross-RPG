import { describe, expect, it } from 'vitest';
import { jobPay, newCareerState } from '../src/core/career';
import { checkContent } from '../src/core/content';
import { finishBatch, finishPass, openJobAt, startJob } from '../src/core/jobs';
import { ticketJob, ticketPay, ticketProblem, ticketsOffered } from '../src/core/jobBoard';
import { SAVE_VERSION, parseSave } from '../src/core/saves';
import { loadManifest, loadMaps, rawContent } from './helpers';

const content = checkContent(rawContent(), loadManifest(), loadMaps()).content!;
const { bikes, story, world, skills, tools, jobboard } = content;
const board = jobboard.boards.find((b) => b.id === 'board.phoenix')!;
const fresh = () => newCareerState(bikes, story, 'yamamoto', () => 0.5);

describe('customer repair tickets (Spec 3.2, 14.5a; Areas 2 to 8 plan gap 5)', () => {
  it('the board is on the Phoenix MX job board object and pays £10 to £25 a ticket', () => {
    expect(board.map).toBe('int-home-local-garage');
    expect(board.action).toBe('jobs.customer_repairs');
    expect(ticketPay(board, board.grades[0])).toBe(10);
    expect(ticketPay(board, board.grades[1])).toBe(25);
  });

  it('offers a fixed set of tickets until one is finished, then a new set', () => {
    const career = fresh();
    const a = ticketsOffered(board, bikes, career);
    expect(a).toHaveLength(board.offers);
    expect(ticketsOffered(board, bikes, career)).toEqual(a);
    for (const t of a) {
      expect(bikes.slots.some((s) => s.id === t.slot)).toBe(true);
      expect(t.grade).toBeGreaterThanOrEqual(board.grades[0]);
      expect(t.grade).toBeLessThanOrEqual(board.grades[1]);
      expect(board.customers).toContain(t.customer);
    }
    career.counters[board.id] = 1;
    expect(ticketsOffered(board, bikes, career)).not.toEqual(a);
  });

  it('needs the tool set for the part, up to the ticket grade', () => {
    const career = fresh();
    const ticket = { slot: 'bodywork', grade: 3, pay: 25, customer: 'Sam' };
    expect(ticketProblem(tools, career, ticket)).toMatch(/needs/i);
    const set = tools.sets.find((s) => s.slots.includes('bodywork'))!;
    career.tools = { [set.id]: set.versions[0].id };
    expect(ticketProblem(tools, career, ticket)).toBeNull();
    expect(ticketProblem(tools, career, { ...ticket, grade: set.versions[0].grade + 1 })).toMatch(/Grade/);
  });

  it('plays as a one-part batch on the garage stations, never a single click, and pays and trains on the last station', () => {
    const career = fresh();
    const ticket = { slot: 'bodywork', grade: 2, pay: ticketPay(board, 2), customer: 'Sam' };
    const job = ticketJob(board, tools, bikes, ticket);
    expect(job.batch).toBe(1);
    expect(job.stations.length).toBeGreaterThanOrEqual(3);
    expect(job.stations.every((s) => s.xp?.bodywork === board.xpPerStation)).toBe(true);
    const r = startJob(career, job);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.open.ticket = ticket;
    // Left and come back: the ticket is still open on the board.
    expect(openJobAt(career, job)?.ticket).toEqual(ticket);
    const money = career.money;
    const pass = finishPass(skills, career, job, jobPay(world, job), () => 0);
    expect(pass.parts).toBe(1);
    expect(pass.done).toBe(true);
    expect(career.money - money).toBe(jobPay(world, job));
    expect(career.skills.xp.bodywork).toBe(board.xpPerStation * job.stations.length);
    finishBatch(skills, career, job, new Set());
    expect(openJobAt(career, job)).toBeNull();
    expect(career.counters[board.id]).toBe(1);
    expect(career.bag).toHaveLength(0);
  });

  it('an open ticket survives a save round trip', () => {
    const career = fresh();
    const ticket = { slot: 'wheels_tyres', grade: 1, pay: 10, customer: 'Jo' };
    const job = ticketJob(board, tools, bikes, ticket);
    const r = startJob(career, job);
    if (r.ok) r.open.ticket = ticket;
    const save = { version: SAVE_VERSION, savedAt: 'now', rider: { name: 'A', look: 'player-m-start-a' }, position: { map: 'area1-home-town', x: 1, y: 1, facing: 'down' }, flags: {}, stats: { playSeconds: 0 }, career, van: null, driving: false };
    const back = parseSave(JSON.stringify(save));
    expect(back).not.toBeNull();
    expect(back!.career.jobs?.open[board.id]?.ticket).toEqual(ticket);
    // A ticket missing its part is not a save.
    expect(parseSave(JSON.stringify({ ...save, career: { ...career, jobs: { open: { [board.id]: { job: board.id, made: 0, ticket: { grade: 1 } } } } } }))).toBeNull();
  });
});
