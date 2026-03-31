import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WorkoutGridLogger } from '../components/trainee/WorkoutGridLogger';
import type { Client, Program, WorkoutWeek, WorkoutDay, ExercisePlan, ProgramColumn } from '../types';

// ─── Minimal mock data ───────────────────────────────────────────────────────

const PLAN_COLS: ProgramColumn[] = [
  { id: 'sets',        label: 'Sets',        type: 'plan' },
  { id: 'reps',        label: 'Reps',        type: 'plan' },
];

const ACTUAL_COLS: ProgramColumn[] = [
  { id: 'actualLoad',  label: 'Actual Load', type: 'actual' },
  { id: 'actualRpe',   label: 'Actual RPE',  type: 'actual' },
  { id: 'notes',       label: 'Notes',       type: 'actual' },
];

const ALL_COLS: ProgramColumn[] = [...PLAN_COLS, ...ACTUAL_COLS];

const EXERCISE: ExercisePlan = {
  id: 'e1',
  exerciseId: 'squat',
  exerciseName: 'Back Squat',
  sets: 4,
  reps: '5',
  values: {},
};

const DAY: WorkoutDay  = { id: 'd1', dayNumber: 1, name: 'Lower Body A', exercises: [EXERCISE] };
const WEEK: WorkoutWeek = { id: 'w1', weekNumber: 1, days: [DAY] };

const PROGRAM: Program = {
  id: 'p1',
  name: 'Hypertrophy Phase 1',
  weeks: [WEEK],
  columns: ALL_COLS,
};

const CLIENT: Client = {
  id: 'c1',
  name: 'Noam Marks',
  email: 'noam@example.com',
  role: 'trainee',
  programs: [PROGRAM],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkoutGridLogger', () => {
  it('renders the session header with client name and day', () => {
    render(
      <WorkoutGridLogger
        client={CLIENT}
        program={PROGRAM}
        week={WEEK}
        day={DAY}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Log Session')).toBeInTheDocument();
    expect(screen.getByText(/Noam Marks/)).toBeInTheDocument();
    expect(screen.getByText(/Lower Body A/)).toBeInTheDocument();
  });

  it('renders plan columns as read-only and actual columns as inputs', () => {
    render(
      <WorkoutGridLogger
        client={CLIENT}
        program={PROGRAM}
        week={WEEK}
        day={DAY}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // Plan values are rendered as static text
    expect(screen.getByText('4')).toBeInTheDocument(); // sets
    expect(screen.getByText('5')).toBeInTheDocument(); // reps

    // Actual inputs exist (data-testid pattern: input-{exId}-{colId})
    const actualLoadInput = screen.getByTestId('input-e1-actualLoad');
    const actualRpeInput  = screen.getByTestId('input-e1-actualRpe');
    expect(actualLoadInput).toBeInTheDocument();
    expect(actualRpeInput).toBeInTheDocument();
  });

  it('allows a trainee to type an actual load value', async () => {
    const user = userEvent.setup();
    render(
      <WorkoutGridLogger
        client={CLIENT}
        program={PROGRAM}
        week={WEEK}
        day={DAY}
        onBack={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const input = screen.getByTestId('input-e1-actualLoad');
    await user.clear(input);
    await user.type(input, '140');
    expect(input).toHaveValue('140');
  });

  it('calls onSave with updated exercises when Save Session is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <WorkoutGridLogger
        client={CLIENT}
        program={PROGRAM}
        week={WEEK}
        day={DAY}
        onBack={vi.fn()}
        onSave={onSave}
      />
    );

    // Log actual load
    const input = screen.getByTestId('input-e1-actualLoad');
    await user.clear(input);
    await user.type(input, '120');

    // Save
    const saveBtn = screen.getByTestId('save-session-btn');
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledOnce();

    const savedDay: WorkoutDay = onSave.mock.calls[0][0];
    expect(savedDay.id).toBe('d1');
    // The exercise should carry the typed actual load
    expect(savedDay.exercises[0].actualLoad).toBe('120');
  });

  it('calls onBack when the back arrow is clicked', () => {
    const onBack = vi.fn();
    render(
      <WorkoutGridLogger
        client={CLIENT}
        program={PROGRAM}
        week={WEEK}
        day={DAY}
        onBack={onBack}
        onSave={vi.fn()}
      />
    );

    // The back button is the first button rendered (ArrowLeft in the header)
    const [backBtn] = screen.getAllByRole('button');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
