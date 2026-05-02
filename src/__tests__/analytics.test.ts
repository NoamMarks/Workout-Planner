import { describe, it, expect } from 'vitest';
import {
  estimate1RM,
  parseReps,
  parseLoad,
  getLoadedSets,
  aggregateE1RM,
  aggregateVolume,
  exerciseVolume,
  listLoggedExercises,
  personalRecord,
  exerciseFrequency,
} from '../lib/analytics';
import type { Client, Program, ExercisePlan, WorkoutDay, WorkoutWeek } from '../types';

// ─── Builders ────────────────────────────────────────────────────────────────

function makeClient(programs: Program[]): Client {
  return {
    id: 'c1',
    name: 'Test Trainee',
    email: 'test@example.com',
    role: 'trainee',
    programs,
  };
}

function makeExercise(over: Partial<ExercisePlan> & { id: string }): ExercisePlan {
  return {
    exerciseId: over.exerciseId ?? 'squat',
    exerciseName: over.exerciseName ?? 'Back Squat',
    reps: over.reps ?? '5',
    values: over.values ?? {},
    ...over,
  };
}

function makeDay(over: Partial<WorkoutDay> & { id: string }): WorkoutDay {
  return {
    dayNumber: over.dayNumber ?? 1,
    name: over.name ?? 'Lower',
    exercises: over.exercises ?? [],
    ...over,
  };
}

function makeProgram(weeks: WorkoutWeek[], over: Partial<Program> = {}): Program {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? 'Block 1',
    status: over.status ?? 'active',
    columns: [],
    weeks,
    ...over,
  };
}

// ─── Epley + parsers ─────────────────────────────────────────────────────────

describe('estimate1RM (Epley)', () => {
  it('matches the formula at exact known points', () => {
    // 100 × (1 + 1/30) = 103.333… → 103.3
    expect(estimate1RM(100, 1)).toBeCloseTo(103.3, 1);
    // 100 × (1 + 5/30) = 116.666… → 116.7
    expect(estimate1RM(100, 5)).toBe(116.7);
    // 60 × (1 + 10/30) = 80
    expect(estimate1RM(60, 10)).toBe(80);
  });

  it('returns null for non-finite or non-positive inputs', () => {
    expect(estimate1RM(0, 5)).toBeNull();
    expect(estimate1RM(100, 0)).toBeNull();
    expect(estimate1RM(-1, 5)).toBeNull();
    expect(estimate1RM(100, -2)).toBeNull();
    expect(estimate1RM(NaN, 5)).toBeNull();
    expect(estimate1RM(100, NaN)).toBeNull();
    expect(estimate1RM(Infinity, 5)).toBeNull();
  });

  it('rounds to one decimal place', () => {
    expect(estimate1RM(102.5, 7)).toBe(126.4);
    expect(estimate1RM(67.5, 12)).toBe(94.5);
  });
});

describe('parseReps', () => {
  it('parses plain numeric strings and numbers', () => {
    expect(parseReps(5)).toBe(5);
    expect(parseReps('5')).toBe(5);
    expect(parseReps('12')).toBe(12);
  });

  it('parses ranges using the lower bound', () => {
    expect(parseReps('5-8')).toBe(5);
    expect(parseReps('8-10')).toBe(8);
    expect(parseReps('15-20')).toBe(15);
  });

  it('extracts the first number from suffixed strings', () => {
    expect(parseReps('5 reps')).toBe(5);
    expect(parseReps('8x')).toBe(8);
  });

  it('returns null for inputs with no numeric content', () => {
    expect(parseReps('AMRAP')).toBeNull();
    expect(parseReps('')).toBeNull();
    expect(parseReps(undefined)).toBeNull();
  });

  it('returns null for zero or negative numeric input', () => {
    expect(parseReps(0)).toBeNull();
    expect(parseReps(-5)).toBeNull();
    expect(parseReps('0')).toBeNull();
  });
});

describe('parseLoad', () => {
  it('parses plain kg numbers and numbers with unit suffix', () => {
    expect(parseLoad('100')).toBe(100);
    expect(parseLoad('100kg')).toBe(100);
    expect(parseLoad('100 kg')).toBe(100);
    expect(parseLoad('100.5')).toBe(100.5);
    expect(parseLoad('102.5kg')).toBe(102.5);
  });

  it('returns null for empty / non-numeric / undefined', () => {
    expect(parseLoad('')).toBeNull();
    expect(parseLoad(undefined)).toBeNull();
    expect(parseLoad('abc')).toBeNull();
    expect(parseLoad('—')).toBeNull();
  });

  it('rejects zero (treats as no load)', () => {
    expect(parseLoad('0')).toBeNull();
    expect(parseLoad('0kg')).toBeNull();
  });
});

// ─── Per-set discovery (the layer the new logger writes to) ──────────────────

describe('getLoadedSets', () => {
  it('reads per-set load values from ex.values keyed `set_<n>_load`', () => {
    const ex = makeExercise({
      id: 'e',
      reps: '5',
      values: {
        set_1_load: '100',
        set_2_load: '105',
        set_3_load: '110',
      },
    });
    const sets = getLoadedSets(ex);
    expect(sets.map((s) => s.load)).toEqual([100, 105, 110]);
    expect(sets.every((s) => s.reps === 5)).toBe(true);
    expect(sets.map((s) => s.setN)).toEqual([1, 2, 3]);
  });

  it('falls back to legacy ex.actualLoad when no per-set keys exist', () => {
    const ex = makeExercise({
      id: 'e',
      reps: '5',
      actualLoad: '100',
      values: {},
    });
    const sets = getLoadedSets(ex);
    expect(sets).toEqual([{ load: 100, reps: 5, setN: 1 }]);
  });

  it('does NOT double-count when set_1_load exists alongside actualLoad', () => {
    // The new logger dual-writes set 1 → both keys are present. We must
    // count once, otherwise the heaviest-set e1RM gets duplicated.
    const ex = makeExercise({
      id: 'e',
      reps: '5',
      actualLoad: '100', // legacy mirror
      values: {
        set_1_load: '100',
        set_2_load: '110',
      },
    });
    const sets = getLoadedSets(ex);
    expect(sets).toHaveLength(2);
    expect(sets.map((s) => s.load)).toEqual([100, 110]);
  });

  it('returns [] when reps cannot be parsed (e.g. AMRAP)', () => {
    const ex = makeExercise({
      id: 'e',
      reps: 'AMRAP',
      values: { set_1_load: '100' },
    });
    expect(getLoadedSets(ex)).toEqual([]);
  });

  it('skips per-set entries with non-numeric load values', () => {
    const ex = makeExercise({
      id: 'e',
      reps: '5',
      values: {
        set_1_load: '100',
        set_2_load: '',     // skipped — empty
        set_3_load: 'BW',   // skipped — not numeric
        set_4_load: '110',
      },
    });
    const sets = getLoadedSets(ex);
    expect(sets.map((s) => s.load)).toEqual([100, 110]);
    expect(sets.map((s) => s.setN)).toEqual([1, 4]);
  });

  it('ignores non-load keys in ex.values (rpe, completed, etc.)', () => {
    const ex = makeExercise({
      id: 'e',
      reps: '5',
      values: {
        set_1_load: '100',
        set_1_rpe: '8',
        set_1_completed: '1',
        __completed: '1',
        notes: 'felt heavy',
      },
    });
    const sets = getLoadedSets(ex);
    expect(sets).toEqual([{ load: 100, reps: 5, setN: 1 }]);
  });
});

// ─── aggregateE1RM ───────────────────────────────────────────────────────────

describe('aggregateE1RM', () => {
  function squatProgram(): Program {
    return makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          // Day 1: heaviest set is set 3 (110kg).
          makeDay({
            id: 'd1',
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e1',
                reps: '5',
                values: {
                  set_1_load: '100',
                  set_2_load: '105',
                  set_3_load: '110',
                },
              }),
            ],
          }),
          // Day 2: only set 1 logged. e1RM = 110 × 1.1666 = 128.3.
          makeDay({
            id: 'd2',
            dayNumber: 2,
            loggedAt: '2026-01-22T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e2',
                reps: '5',
                values: { set_1_load: '110' },
                actualLoad: '110', // legacy mirror
              }),
            ],
          }),
          // Day 3: NEVER logged → contributes nothing.
          makeDay({
            id: 'd3',
            dayNumber: 3,
            exercises: [
              makeExercise({ id: 'e3', reps: '5', actualLoad: '120' }),
            ],
          }),
          // Day 4: logged but no actualLoad / no per-set load → skip.
          makeDay({
            id: 'd4',
            dayNumber: 4,
            loggedAt: '2026-01-29T10:00:00Z',
            exercises: [makeExercise({ id: 'e4', reps: '5' })],
          }),
        ],
      },
    ]);
  }

  it('produces one point per logged session, using the heaviest set\'s e1RM', () => {
    const result = aggregateE1RM(makeClient([squatProgram()]), 'squat');
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-01-15');
    // Best set on day 1 was 110kg × 5 → 110 × 1.1666… = 128.333… → 128.3
    expect(result[0].e1rm).toBe(128.3);
    expect(result[1].date).toBe('2026-01-22');
    // Day 2 only had set 1 at 110kg × 5 → also 128.3
    expect(result[1].e1rm).toBe(128.3);
  });

  it('skips days that were never logged', () => {
    const result = aggregateE1RM(makeClient([squatProgram()]), 'squat');
    expect(result.every((p) => p.date !== '2026-01-29')).toBe(true);
  });

  it('skips logged days where the exercise has no loaded sets', () => {
    const result = aggregateE1RM(makeClient([squatProgram()]), 'squat');
    expect(result).toHaveLength(2); // d4 with no load excluded
  });

  it('returns [] for an unknown exerciseId', () => {
    expect(aggregateE1RM(makeClient([squatProgram()]), 'bench')).toEqual([]);
  });

  it('returns [] for a client with no programs', () => {
    expect(aggregateE1RM(makeClient([]), 'squat')).toEqual([]);
  });

  it('walks BOTH active and archived programs and merges into one timeline', () => {
    const archived = makeProgram(
      [
        {
          id: 'w1',
          weekNumber: 1,
          days: [
            makeDay({
              id: 'arc1',
              loggedAt: '2025-12-01T10:00:00Z',
              exercises: [
                makeExercise({
                  id: 'aex',
                  reps: '5',
                  values: { set_1_load: '90' },
                }),
              ],
            }),
          ],
        },
      ],
      { id: 'p-archived', name: 'Old Block', status: 'archived' },
    );
    const result = aggregateE1RM(makeClient([archived, squatProgram()]), 'squat');
    // Archived point sorted to the front by date.
    expect(result[0].date).toBe('2025-12-01');
    expect(result[result.length - 1].date).toBe('2026-01-22');
  });

  it('attaches the program name to each point so the chart can colour by block', () => {
    const result = aggregateE1RM(makeClient([squatProgram()]), 'squat');
    expect(result.every((p) => p.programName === 'Block 1')).toBe(true);
  });

  it('handles range-based plan reps (uses lower bound for conservative e1RM)', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd',
            loggedAt: '2026-02-01T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e',
                reps: '8-10', // range → uses 8
                values: { set_1_load: '100' },
              }),
            ],
          }),
        ],
      },
    ]);
    const [point] = aggregateE1RM(makeClient([program]), 'squat');
    // 100 × (1 + 8/30) = 126.666… → 126.7
    expect(point.e1rm).toBe(126.7);
  });
});

// ─── exerciseVolume + aggregateVolume ────────────────────────────────────────

describe('exerciseVolume', () => {
  it('sums load × reps across every loaded set', () => {
    const ex = makeExercise({
      id: 'e',
      reps: '5',
      values: {
        set_1_load: '100', // 500
        set_2_load: '105', // 525
        set_3_load: '110', // 550
      },
    });
    expect(exerciseVolume(ex)).toBe(500 + 525 + 550);
  });

  it('returns 0 when no loaded sets', () => {
    expect(exerciseVolume(makeExercise({ id: 'e', reps: '5' }))).toBe(0);
  });
});

describe('aggregateVolume', () => {
  it('produces one volume point per logged session, sorted by date', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'a',
            loggedAt: '2026-01-22T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e1',
                reps: '5',
                values: { set_1_load: '100', set_2_load: '110' },
              }),
            ],
          }),
          makeDay({
            id: 'b',
            dayNumber: 2,
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e2',
                reps: '5',
                values: { set_1_load: '90' },
              }),
            ],
          }),
        ],
      },
    ]);
    const points = aggregateVolume(makeClient([program]), 'squat');
    expect(points.map((p) => p.date)).toEqual(['2026-01-15', '2026-01-22']);
    expect(points[0].volume).toBe(450);            // 90 × 5
    expect(points[1].volume).toBe(100 * 5 + 110 * 5); // 1050
  });

  it('skips sessions where the exercise has zero volume', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'a',
            loggedAt: '2026-01-22T10:00:00Z',
            exercises: [makeExercise({ id: 'e', reps: '5' })], // no load
          }),
        ],
      },
    ]);
    expect(aggregateVolume(makeClient([program]), 'squat')).toEqual([]);
  });
});

// ─── listLoggedExercises ─────────────────────────────────────────────────────

describe('listLoggedExercises', () => {
  it('returns distinct logged exercises that have at least one loaded set', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd',
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e1',
                exerciseId: 'squat',
                exerciseName: 'Back Squat',
                reps: '5',
                values: { set_1_load: '100' },
              }),
              makeExercise({
                id: 'e2',
                exerciseId: 'bench',
                exerciseName: 'Bench Press',
                reps: '5',
                values: { set_1_load: '80' },
              }),
              makeExercise({
                id: 'e3',
                exerciseId: 'lat',
                exerciseName: 'Lat Pulldown',
                reps: '10',
                values: {}, // no load — excluded
              }),
            ],
          }),
        ],
      },
    ]);
    const exercises = listLoggedExercises(makeClient([program]));
    expect(exercises.map((e) => e.id).sort()).toEqual(['bench', 'squat']);
  });

  it('deduplicates by exerciseId across days and weeks', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd1',
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({ id: 'e1', exerciseId: 'squat', reps: '5', actualLoad: '100' }),
            ],
          }),
          makeDay({
            id: 'd2',
            dayNumber: 2,
            loggedAt: '2026-01-22T10:00:00Z',
            exercises: [
              makeExercise({ id: 'e2', exerciseId: 'squat', reps: '5', actualLoad: '110' }),
            ],
          }),
        ],
      },
    ]);
    expect(listLoggedExercises(makeClient([program]))).toEqual([{ id: 'squat', name: 'Back Squat' }]);
  });

  it('ignores days that were never logged (even if they have load data)', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd',
            // no loggedAt
            exercises: [
              makeExercise({ id: 'e', exerciseId: 'squat', actualLoad: '100' }),
            ],
          }),
        ],
      },
    ]);
    expect(listLoggedExercises(makeClient([program]))).toEqual([]);
  });
});

// ─── personalRecord ──────────────────────────────────────────────────────────

describe('personalRecord', () => {
  it('returns the heaviest e1RM ever logged for the exercise, with its session date', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd1',
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e1',
                reps: '5',
                values: { set_1_load: '100', set_2_load: '105' },
              }),
            ],
          }),
          makeDay({
            id: 'd2',
            dayNumber: 2,
            loggedAt: '2026-01-22T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e2',
                reps: '3', // heavier per rep — biggest e1RM
                values: { set_1_load: '120' },
              }),
            ],
          }),
        ],
      },
    ]);
    const pr = personalRecord(makeClient([program]), 'squat');
    expect(pr).not.toBeNull();
    // 120 × (1 + 3/30) = 132 → highest of the two days.
    expect(pr?.e1rm).toBe(132);
    expect(pr?.date).toBe('2026-01-22');
    expect(pr?.load).toBe(120);
    expect(pr?.reps).toBe(3);
  });

  it('returns null when no session has a loaded set for that exercise', () => {
    expect(personalRecord(makeClient([]), 'squat')).toBeNull();
  });
});

// ─── exerciseFrequency ───────────────────────────────────────────────────────

describe('exerciseFrequency', () => {
  it('counts logged sessions where the exercise had ≥1 loaded set', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd1',
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({ id: 'e', exerciseId: 'squat', reps: '5', actualLoad: '100' }),
            ],
          }),
          // Logged but exercise had no load → not counted
          makeDay({
            id: 'd2',
            dayNumber: 2,
            loggedAt: '2026-01-22T10:00:00Z',
            exercises: [
              makeExercise({ id: 'e', exerciseId: 'squat', reps: '5' }),
            ],
          }),
          // Not logged → not counted
          makeDay({
            id: 'd3',
            dayNumber: 3,
            exercises: [
              makeExercise({ id: 'e', exerciseId: 'squat', reps: '5', actualLoad: '110' }),
            ],
          }),
          // Logged with per-set load → counted
          makeDay({
            id: 'd4',
            dayNumber: 4,
            loggedAt: '2026-01-29T10:00:00Z',
            exercises: [
              makeExercise({
                id: 'e',
                exerciseId: 'squat',
                reps: '5',
                values: { set_1_load: '105' },
              }),
            ],
          }),
        ],
      },
    ]);
    expect(exerciseFrequency(makeClient([program]), 'squat')).toBe(2);
  });

  it('counts a session ONCE even when the exercise appears multiple times in the same day', () => {
    const program = makeProgram([
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          makeDay({
            id: 'd1',
            loggedAt: '2026-01-15T10:00:00Z',
            exercises: [
              makeExercise({ id: 'a', exerciseId: 'squat', reps: '5', actualLoad: '100' }),
              makeExercise({ id: 'b', exerciseId: 'squat', reps: '5', actualLoad: '105' }),
            ],
          }),
        ],
      },
    ]);
    expect(exerciseFrequency(makeClient([program]), 'squat')).toBe(1);
  });
});
