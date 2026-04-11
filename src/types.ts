export interface ProgramColumn {
  id: string;
  label: string;
  type: 'plan' | 'actual';
}

export interface ExercisePlan {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sets?: number;
  reps?: string;
  expectedRpe?: string;
  weightRange?: string;
  actualLoad?: string;
  actualRpe?: string;
  notes?: string;
  videoUrl?: string;
  values: Record<string, string>;
}

export interface WorkoutDay {
  id: string;
  dayNumber: number;
  name: string;
  exercises: ExercisePlan[];
  /** ISO timestamp of the last save — used by analytics to order sessions chronologically */
  loggedAt?: string;
}

export interface WorkoutWeek {
  id: string;
  weekNumber: number;
  days: WorkoutDay[];
}

export type ProgramStatus = 'active' | 'archived';

export interface Program {
  id: string;
  name: string;
  weeks: WorkoutWeek[];
  columns: ProgramColumn[];
  /** Defaults to 'active' for backwards compatibility with pre-Sprint-2 data */
  status: ProgramStatus;
  /** ISO timestamp set when the program is archived */
  archivedAt?: string;
  /** ISO timestamp set when the program is created */
  createdAt?: string;
  /** Tenant isolation — programs belong to the coach who created them */
  tenantId?: string;
}

export type UserRole = 'superadmin' | 'admin' | 'trainee';

export interface Client {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  /** Tenant isolation key — 'global' for superadmin, coach-id for admins, inherited for trainees */
  tenantId?: string;
  activeProgramId?: string;
  programs: Program[];
}

/** Invite code created by a coach to onboard new trainees */
export interface InviteCode {
  id: string;
  code: string;
  tenantId: string;
  coachId: string;
  createdAt: string;
}

export type AppView = 'landing' | 'signup' | 'forgot' | 'superadmin' | 'coach' | 'trainee' | 'admin';