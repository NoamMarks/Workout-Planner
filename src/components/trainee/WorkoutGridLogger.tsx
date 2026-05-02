import React, { useState, useRef } from 'react';
import { ArrowLeft, Save, Circle, Upload, Play, Calculator, Check } from 'lucide-react';
import { TechnicalCard, TechnicalInput } from '../ui';
import { cn } from '../../lib/utils';
import { DEFAULT_COLUMNS } from '../../constants/mockData';
import { PlateCalculator } from './PlateCalculator';
import { hapticTick, hapticSuccess } from '../../lib/haptics';
import type { Client, Program, WorkoutWeek, WorkoutDay, ExercisePlan, ProgramColumn } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getExerciseValue(ex: ExercisePlan, colId: string): string | number | undefined {
  if (colId === 'sets')        return ex.sets;
  if (colId === 'reps')        return ex.reps;
  if (colId === 'expectedRpe') return ex.expectedRpe;
  if (colId === 'weightRange') return ex.weightRange;
  if (colId === 'actualLoad')  return ex.actualLoad;
  if (colId === 'actualRpe')   return ex.actualRpe;
  if (colId === 'notes')       return ex.notes;
  return ex.values?.[colId] ?? '';
}

/** Stored on ex.values, so the "set completed" mark survives a save+reload
 *  round-trip without forcing a schema change to ExercisePlan. Kept in a
 *  reserved-prefix key so it can never collide with a real custom column. */
const COMPLETED_KEY = '__completed';

function isCompleted(ex: ExercisePlan): boolean {
  return ex.values?.[COMPLETED_KEY] === '1';
}

/** Build the compact "Plan" string shown in each exercise header. Replaces
 *  the per-cell plan columns the previous layout exploded across the row.
 *  Format: "3 × 8-10 @ RPE 7 (70-80%)". Falls back to "—" when there is
 *  no plan data at all. */
function buildPlanSummary(ex: ExercisePlan, columns: ProgramColumn[]): string {
  const planCols = columns.filter((c) => c.type === 'plan');
  const get = (id: string): string => {
    const v = getExerciseValue(ex, id);
    if (v == null) return '';
    const s = String(v).trim();
    return s.length > 0 ? s : '';
  };
  const sets = get('sets');
  const reps = get('reps');
  const rpe = get('expectedRpe');
  const range = get('weightRange');

  const parts: string[] = [];
  if (sets && reps) parts.push(`${sets} × ${reps}`);
  else if (sets) parts.push(`${sets} sets`);
  else if (reps) parts.push(`${reps} reps`);
  if (rpe) parts.push(`@ RPE ${rpe}`);
  if (range) parts.push(`(${range})`);

  // If the program has any custom plan columns, fold them in at the end so
  // a coach who added "Tempo" still sees that instruction.
  for (const col of planCols) {
    if (['sets', 'reps', 'expectedRpe', 'weightRange'].includes(col.id)) continue;
    const v = get(col.id);
    if (v) parts.push(`${col.label}: ${v}`);
  }

  return parts.length > 0 ? parts.join(' ') : '—';
}

/** Per-set storage in ex.values. Set 1 also dual-reads from the legacy
 *  ex.actualLoad / ex.actualRpe so previously-logged single-actual data
 *  surfaces as set 1 the first time the trainee revisits it. */
function setLoadKey(setN: number) { return `set_${setN}_load`; }
function setRpeKey(setN: number)  { return `set_${setN}_rpe`; }
function setDoneKey(setN: number) { return `set_${setN}_completed`; }

function getSetLoad(ex: ExercisePlan, setN: number): string {
  const v = ex.values?.[setLoadKey(setN)];
  if (v != null && v !== '') return v;
  if (setN === 1 && ex.actualLoad) return ex.actualLoad;
  return '';
}
function getSetRpe(ex: ExercisePlan, setN: number): string {
  const v = ex.values?.[setRpeKey(setN)];
  if (v != null && v !== '') return v;
  if (setN === 1 && ex.actualRpe) return ex.actualRpe;
  return '';
}
function isSetDone(ex: ExercisePlan, setN: number): boolean {
  return ex.values?.[setDoneKey(setN)] === '1';
}

/** Number of set rows to render. Falls back to 1 so an exercise without an
 *  explicit set count still renders a usable input row. */
function setCount(ex: ExercisePlan): number {
  const n = ex.sets;
  if (typeof n === 'number' && n > 0) return Math.min(n, 20); // safety cap
  return 1;
}

// ─── Session ID for status bar ───────────────────────────────────────────────

const SESSION_ID = Math.random().toString(36).substring(7).toUpperCase();

// ─── Props ───────────────────────────────────────────────────────────────────

interface WorkoutGridLoggerProps {
  client: Client;
  program: Program;
  week: WorkoutWeek;
  day: WorkoutDay;
  onBack: () => void;
  onSave: (updatedDay: WorkoutDay) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorkoutGridLogger({
  client,
  program,
  week,
  day,
  onBack,
  onSave,
}: WorkoutGridLoggerProps) {
  const [exercises, setExercises] = useState<ExercisePlan[]>(day.exercises);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [plateCalcOpen, setPlateCalcOpen] = useState(false);
  const [plateCalcWeight, setPlateCalcWeight] = useState('');
  const [plateCalcExerciseId, setPlateCalcExerciseId] = useState<string | null>(null);
  const [plateCalcSetN, setPlateCalcSetN] = useState<number>(1);

  const columns = program.columns ?? DEFAULT_COLUMNS;
  const notesIsActual = columns.some((c) => c.id === 'notes' && c.type === 'actual');

  /**
   * Generic update — same shape and semantics as before, so any caller
   * that was passing legacy field names (`actualLoad`, `actualRpe`,
   * `notes`, `videoUrl`) continues to work. New per-set field names
   * (`set_<n>_load` etc.) drop straight into ex.values via the catch-all
   * branch. Set-1 numeric writes ALSO mirror to the legacy single-actual
   * fields so analytics views that read ex.actualLoad / ex.actualRpe stay
   * coherent with the latest input.
   */
  const updateExercise = (id: string, field: string, value: string) => {
    if (['actualLoad', 'actualRpe'].includes(field) && value.trim() !== '') {
      hapticTick();
    }
    const setMatch = field.match(/^set_(\d+)_(load|rpe)$/);
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== id) return ex;
        if (['actualLoad', 'actualRpe', 'notes', 'videoUrl'].includes(field)) {
          return { ...ex, [field]: value };
        }
        const next: ExercisePlan = {
          ...ex,
          values: { ...(ex.values ?? {}), [field]: value },
        };
        if (setMatch && setMatch[1] === '1') {
          if (setMatch[2] === 'load') next.actualLoad = value;
          else if (setMatch[2] === 'rpe') next.actualRpe = value;
        }
        return next;
      }),
    );
  };

  /** Toggle the per-exercise __completed flag — preserved end-to-end from
   *  the prior sprint (same key, same persistence). The exercise-level
   *  toggle dims the whole group; per-set checkboxes can still flag
   *  individual sets within. */
  const toggleCompleted = (id: string) => {
    hapticTick();
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== id) return ex;
        const next = !isCompleted(ex);
        return {
          ...ex,
          values: { ...(ex.values ?? {}), [COMPLETED_KEY]: next ? '1' : '0' },
        };
      }),
    );
  };

  /** Per-set Done toggle. Lives in ex.values keyed `set_<n>_completed`. */
  const toggleSetDone = (id: string, setN: number) => {
    hapticTick();
    const key = setDoneKey(setN);
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== id) return ex;
        const flipped = ex.values?.[key] === '1' ? '0' : '1';
        return { ...ex, values: { ...(ex.values ?? {}), [key]: flipped } };
      }),
    );
  };

  const handleSave = () => {
    hapticSuccess();
    onSave({ ...day, exercises });
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0] && uploadingFor) {
      const url = URL.createObjectURL(e.target.files[0]);
      updateExercise(uploadingFor, 'videoUrl', url);
      setUploadingFor(null);
    }
  };

  // ── Layout grids ────────────────────────────────────────────────────────
  // Set rows: SET # (compact) | WEIGHT (wide, with plate-calc) | RPE | DONE.
  // Mobile-first: WEIGHT and RPE both get generous fr units so the iOS
  // number pad has room to breathe. The plate-calc icon is tucked inside
  // the weight cell so we don't burn a separate column on it.
  const setGridTemplate = '32px 1fr minmax(72px, 0.6fr) 44px';

  return (
    <div className="space-y-3 md:space-y-8 h-full flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-end gap-3">
        <div className="flex items-center space-x-3 md:space-x-6 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted transition-colors flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 text-foreground" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tighter uppercase italic font-serif text-foreground truncate">
              Log Session
            </h1>
            <p className="text-muted-foreground font-mono text-[10px] md:text-xs mt-1 uppercase tracking-widest truncate">
              {client.name} / Week {week.weekNumber} / {day.name}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2 md:gap-4 shrink-0">
          <button
            onClick={handleSave}
            data-testid="save-session-btn"
            className="btn-press bg-accent text-accent-foreground px-4 md:px-8 py-3 md:py-4 text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center rounded-input hover:opacity-90 shadow-lg hover:shadow-accent/20 min-h-[44px]"
          >
            <Save className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Save Session</span>
          </button>
        </div>
      </header>

      {/* Exercise stack */}
      <TechnicalCard className="flex-grow overflow-auto border md:border-2 relative">
        {/* Top: column header. Sticky at the very top of the scroll area so
            SET / WEIGHT / RPE / DONE labels are always visible. */}
        <div
          className="sticky top-0 z-30 grid bg-card/95 backdrop-blur-md border-b border-border shadow-sm"
          style={{ gridTemplateColumns: setGridTemplate }}
        >
          <div className="p-2 md:p-3 text-[9px] md:text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-center">
            Set
          </div>
          <div className="p-2 md:p-3 text-[9px] md:text-[10px] text-foreground font-mono uppercase tracking-widest text-center bg-muted/50">
            Weight
          </div>
          <div className="p-2 md:p-3 text-[9px] md:text-[10px] text-foreground font-mono uppercase tracking-widest text-center bg-muted/50">
            RPE
          </div>
          <div className="p-2 md:p-3 text-[9px] md:text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-center">
            Done
          </div>
        </div>

        {exercises.map((ex, idx) => {
          const completed = isCompleted(ex);
          const planSummary = buildPlanSummary(ex, columns);
          const sets = setCount(ex);
          const notesValue = ex.notes ?? '';
          return (
            <section
              key={ex.id}
              data-testid={`exercise-row-${idx}`}
              className={cn(
                'border-b border-border transition-opacity',
                completed && 'opacity-50',
              )}
            >
              {/* Sticky exercise header — pins below the column-header row
                  so the trainee always knows which exercise they're in
                  while scrolling between sets. */}
              <div
                className="sticky top-[34px] md:top-[42px] z-20 bg-card/95 backdrop-blur-md border-b border-border px-2 md:px-4 py-2 md:py-3 flex items-center gap-2 md:gap-4"
                data-testid={`exercise-header-${idx}`}
              >
                <span className="text-[10px] md:text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm md:text-base font-bold uppercase tracking-tight truncate text-foreground"
                    title={ex.exerciseName}
                  >
                    {ex.exerciseName}
                  </div>
                  <div
                    className="text-[10px] md:text-[11px] text-muted-foreground font-mono truncate"
                    title={planSummary}
                    data-testid={`plan-summary-${idx}`}
                  >
                    Plan: {planSummary}
                  </div>
                </div>
                <div className="flex items-center gap-1 md:gap-2 shrink-0">
                  {/* Video upload / view */}
                  {ex.videoUrl ? (
                    <a
                      href={ex.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-9 h-9 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all"
                      aria-label="Play video"
                    >
                      <Play className="w-4 h-4" />
                    </a>
                  ) : (
                    <button
                      onClick={() => { setUploadingFor(ex.id); fileInputRef.current?.click(); }}
                      className="w-9 h-9 bg-muted text-muted-foreground rounded-full flex items-center justify-center hover:bg-foreground hover:text-background transition-all"
                      aria-label="Upload video"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  )}
                  {/* Exercise-level Done — preserves __completed persistence. */}
                  <button
                    onClick={() => toggleCompleted(ex.id)}
                    aria-label={completed ? 'Mark as not done' : 'Mark exercise as done'}
                    aria-pressed={completed}
                    data-testid={`done-toggle-${ex.id}`}
                    className={cn(
                      'w-9 h-9 rounded-md flex items-center justify-center transition-all border shrink-0',
                      completed
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                        : 'border-border bg-card text-muted-foreground hover:border-emerald-500 hover:text-emerald-500',
                    )}
                  >
                    <Check className={cn('w-4 h-4 transition-opacity', completed ? 'opacity-100' : 'opacity-30')} />
                  </button>
                </div>
              </div>

              {/* Set rows — one row per planned set. */}
              {Array.from({ length: sets }, (_, i) => {
                const setN = i + 1;
                const loadValue = getSetLoad(ex, setN);
                const rpeValue = getSetRpe(ex, setN);
                const setDone = isSetDone(ex, setN);
                return (
                  <div
                    key={setN}
                    data-testid={`set-row-${ex.id}-${setN}`}
                    className={cn(
                      'grid items-center border-b border-border/50 last:border-b-0',
                      setDone ? 'bg-emerald-500/5' : '',
                    )}
                    style={{ gridTemplateColumns: setGridTemplate }}
                  >
                    <div className="px-1 py-1 text-[11px] md:text-xs text-muted-foreground font-mono tabular-nums text-center">
                      {setN}
                    </div>
                    <div className="px-1 py-1 flex items-center gap-1 bg-muted/10">
                      <TechnicalInput
                        value={loadValue}
                        onChange={(val) => updateExercise(ex.id, setLoadKey(setN), val)}
                        placeholder="—"
                        maxLength={10}
                        inputMode="decimal"
                        pattern="[0-9]*"
                        autoComplete="off"
                        className="text-center tabular-nums px-1 min-h-[44px] text-base md:text-sm"
                        data-testid={`input-${ex.id}-set-${setN}-load`}
                      />
                      <button
                        onClick={() => {
                          setPlateCalcWeight(loadValue);
                          setPlateCalcExerciseId(ex.id);
                          setPlateCalcSetN(setN);
                          setPlateCalcOpen(true);
                        }}
                        className="shrink-0 w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Plate calculator"
                        data-testid={`plate-calc-btn-${ex.id}-set-${setN}`}
                      >
                        <Calculator className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="px-1 py-1 bg-muted/10">
                      <TechnicalInput
                        value={rpeValue}
                        onChange={(val) => updateExercise(ex.id, setRpeKey(setN), val)}
                        placeholder="—"
                        maxLength={5}
                        inputMode="decimal"
                        pattern="[0-9]*"
                        autoComplete="off"
                        className="text-center tabular-nums px-1 min-h-[44px] text-base md:text-sm"
                        data-testid={`input-${ex.id}-set-${setN}-rpe`}
                      />
                    </div>
                    <div className="px-1 py-1 flex items-center justify-center">
                      <button
                        onClick={() => toggleSetDone(ex.id, setN)}
                        aria-label={setDone ? `Set ${setN} not done` : `Mark set ${setN} done`}
                        aria-pressed={setDone}
                        data-testid={`set-done-toggle-${ex.id}-${setN}`}
                        className={cn(
                          'w-9 h-9 rounded-md flex items-center justify-center transition-all border',
                          setDone
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-border bg-card text-muted-foreground hover:border-emerald-500 hover:text-emerald-500',
                        )}
                      >
                        <Check className={cn('w-4 h-4', setDone ? 'opacity-100' : 'opacity-30')} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Notes — full-width input, only when the program defines a
                  notes column as actual-type (the default). */}
              {notesIsActual && (
                <div className="px-2 md:px-4 py-2 border-b border-border/50">
                  <TechnicalInput
                    value={notesValue}
                    onChange={(val) => updateExercise(ex.id, 'notes', val)}
                    placeholder="Notes…"
                    maxLength={150}
                    autoComplete="off"
                    className="text-[11px] md:text-xs italic min-h-[36px]"
                    data-testid={`input-${ex.id}-notes`}
                  />
                </div>
              )}
            </section>
          );
        })}
      </TechnicalCard>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="video/*"
        onChange={handleVideoUpload}
      />

      {/* Status bar */}
      <div className="bg-card border border-border px-3 md:px-4 py-2 md:py-4 font-mono text-[9px] md:text-[10px] text-muted-foreground uppercase tracking-widest flex justify-between items-center gap-2">
        <span className="flex items-center min-w-0">
          <Circle className="w-2 h-2 fill-green-500 text-green-500 mr-1.5 shrink-0" />
          <span className="truncate">
            <span className="hidden md:inline">System Status: </span>Operational
          </span>
        </span>
        <span className="truncate">{SESSION_ID}</span>
      </div>

      <PlateCalculator
        isOpen={plateCalcOpen}
        onClose={() => {
          setPlateCalcOpen(false);
          setPlateCalcExerciseId(null);
        }}
        initialWeight={plateCalcWeight}
        onApply={(weight) => {
          if (plateCalcExerciseId) {
            updateExercise(plateCalcExerciseId, setLoadKey(plateCalcSetN), weight);
          }
          setPlateCalcOpen(false);
          setPlateCalcExerciseId(null);
        }}
      />
    </div>
  );
}
