// Customer repair tickets at Phoenix MX (Spec 3.2, 14.5a; Areas 2 to 8 plan, gap 5: the one job
// board, in every area). A ticket is a customer's part to put right: it plays as a station
// minigame like the shifts (strip, fix, refit, test), never a single click, pays £10 to £25 and
// trains the part's Mechanical Engineer skill. A ticket asks for the tool set for its slot, so
// better tools open better-paying tickets. One open ticket per board, resumable like a batch.

import type { BikesData, CareerState, JobDef } from './career';
import { seededRng } from './race';
import { toolsFor, type ToolsData } from './tools';
import type { ContentError, Schema } from './validate';

export interface BoardDef {
  id: string;
  name: string;
  map: string;
  /** The map object action that opens the board. */
  action: string;
  needs?: string;
  /** Tickets on offer at a time. */
  offers: number;
  /** Lowest and highest part grade on the tickets. */
  grades: [number, number];
  /** Pounds: base plus perGrade for every grade above 1. */
  pay: { base: number; perGrade: number };
  /** Child skill XP for the part's skill at every station. */
  xpPerStation: number;
  customers: string[];
  stations: { object: string; label: string; ms: number }[];
}

export interface JobBoardData {
  boards: BoardDef[];
}

export interface Ticket {
  slot: string;
  grade: number;
  /** Pounds. */
  pay: number;
  customer: string;
}

export const ticketPay = (board: BoardDef, grade: number) => board.pay.base + board.pay.perGrade * (grade - 1);

/** The tickets on the board now: fixed until one is done, then a new set. */
export function ticketsOffered(board: BoardDef, bikes: BikesData, career: CareerState): Ticket[] {
  const done = career.counters[board.id] ?? 0;
  const rng = seededRng(((career.shops?.seed ?? 0) ^ (done * 2654435761) ^ hash(board.id)) >>> 0);
  const [lo, hi] = board.grades;
  return Array.from({ length: board.offers }, () => {
    const slot = bikes.slots[Math.floor(rng() * bikes.slots.length)].id;
    const grade = lo + Math.floor(rng() * (hi - lo + 1));
    return { slot, grade, pay: ticketPay(board, grade), customer: board.customers[Math.floor(rng() * board.customers.length)] };
  });
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Why the rider can't take a ticket, or null: it needs the tool set for its slot, up to its grade. */
export function ticketProblem(tools: ToolsData, career: CareerState, ticket: Ticket): string | null {
  const t = toolsFor(tools, career, ticket.slot);
  if (!t) return 'No tools cover this part.';
  if (!t.owned) return `Needs ${t.set.name.toLowerCase()}.`;
  if (ticket.grade > t.owned.grade) return `Needs tools for Grade ${ticket.grade}; yours stop at ${t.owned.grade}.`;
  return null;
}

/** A ticket as a one-part batch job on the board's stations (core/jobs.ts runs it like a shift). */
export function ticketJob(board: BoardDef, tools: ToolsData, bikes: BikesData, ticket: Ticket): JobDef {
  const skill = tools.sets.find((s) => s.slots.includes(ticket.slot))?.skill ?? 'bodywork';
  const name = bikes.slots.find((s) => s.id === ticket.slot)?.name.toLowerCase() ?? ticket.slot;
  return {
    id: board.id,
    name: `${ticket.customer}'s ${name}`,
    map: board.map,
    start: board.action,
    product: 'repair',
    batch: 1,
    pay: ticket.pay,
    facility: board.id,
    stations: board.stations.map((s) => ({ ...s, xp: { [skill]: board.xpPerStation } })),
  };
}

const ID = /^[a-z0-9_.-]+$/;

export const JOB_BOARD_SCHEMA: Schema = {
  type: 'object',
  optional: ['note'],
  fields: {
    note: { type: 'string' },
    boards: {
      type: 'array',
      items: {
        type: 'object',
        optional: ['needs'],
        fields: {
          id: { type: 'string', pattern: ID },
          name: { type: 'string', nonEmpty: true },
          map: { type: 'string', pattern: ID },
          action: { type: 'string', pattern: ID },
          needs: { type: 'string', pattern: ID },
          offers: { type: 'number', integer: true, min: 1, max: 6 },
          grades: { type: 'array', items: { type: 'number', integer: true, min: 1, max: 10 }, minItems: 2, maxItems: 2 },
          pay: { type: 'object', fields: { base: { type: 'number', min: 0 }, perGrade: { type: 'number', min: 0 } } },
          xpPerStation: { type: 'number', min: 0 },
          customers: { type: 'array', minItems: 1, items: { type: 'string', nonEmpty: true } },
          stations: { type: 'array', minItems: 1, items: { type: 'object', fields: { object: { type: 'string', nonEmpty: true }, label: { type: 'string', nonEmpty: true }, ms: { type: 'number', integer: true, min: 0 } } } },
        },
      },
    },
  },
};

/** Checks the boards against the maps: the opening object and every station exist. */
export function checkJobBoard(file: string, data: JobBoardData, maps: Map<string, { objects: { name: string; props: Record<string, unknown> }[] }>): ContentError[] {
  const errors: ContentError[] = [];
  const err = (field: string, message: string) => errors.push({ file, field, message });
  const seen = new Set<string>();
  data.boards.forEach((b, i) => {
    const at = (f: string) => `boards[${i}].${f}`;
    if (seen.has(b.id)) err(at('id'), `"${b.id}" is used twice`);
    seen.add(b.id);
    const m = maps.get(b.map);
    if (!m) return void err(at('map'), `no map "${b.map}"`);
    if (!m.objects.some((o) => o.props.action === b.action)) err(at('action'), `no object with action "${b.action}" on ${b.map}`);
    b.stations.forEach((s, k) => !m.objects.some((o) => o.name === s.object) && err(at(`stations[${k}].object`), `no object "${s.object}" on ${b.map}`));
    if (b.grades[0] > b.grades[1]) err(at('grades'), 'the lowest grade is above the highest');
  });
  return errors;
}
