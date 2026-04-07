import { useState } from 'react';
import { ArrowLeft, AlertCircle, Smartphone, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TechnicalCard } from '../ui';
import { cn } from '../../lib/utils';
import { useWakeLock } from '../../hooks/useWakeLock';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import type { Client, Program, WorkoutWeek, WorkoutDay } from '../../types';

interface ClientDashboardProps {
  client: Client;
  onBack: () => void;
  onStartWorkout: (week: WorkoutWeek, day: WorkoutDay) => void;
}

type Tab = 'current' | 'history' | 'analytics';

export function ClientDashboard({ client, onBack, onStartWorkout }: ClientDashboardProps) {
  const activeProgram =
    client.programs.find((p) => p.id === client.activeProgramId && p.status !== 'archived') ??
    client.programs.find((p) => p.status !== 'archived') ??
    null;

  const archivedPrograms = client.programs.filter((p) => p.status === 'archived');

  const [tab, setTab] = useState<Tab>('current');
  const [selectedWeekId, setSelectedWeekId] = useState(activeProgram?.weeks[0]?.id);
  const selectedWeek =
    activeProgram?.weeks.find((w) => w.id === selectedWeekId) ?? activeProgram?.weeks[0];

  const wakeLock = useWakeLock();

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex justify-between items-end">
        <div className="flex items-center space-x-8">
          <motion.button whileHover={{ x: -4 }} onClick={onBack} className="p-3 hover:bg-muted transition-colors rounded-sm">
            <ArrowLeft className="w-8 h-8 text-foreground" />
          </motion.button>
          <div>
            <h1 className="text-5xl font-bold tracking-tighter uppercase italic font-serif text-foreground">
              {client.name}
            </h1>
            <p className="text-muted-foreground font-mono text-xs mt-1 uppercase tracking-widest">
              {activeProgram?.name ?? 'No Active Program'}
            </p>
          </div>
        </div>
        {/* Gym Mode toggle */}
        {wakeLock.isSupported && (
          <button
            onClick={() => void wakeLock.toggle()}
            data-testid="gym-mode-toggle"
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-[10px] font-mono uppercase tracking-widest border transition-all',
              wakeLock.isActive
                ? 'bg-green-600 text-white border-green-600'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            )}
          >
            <Smartphone className="w-4 h-4" />
            {wakeLock.isActive ? 'Gym Mode On' : 'Gym Mode'}
          </button>
        )}
      </header>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-border">
        {(['current', 'history', 'analytics'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`dashboard-tab-${t}`}
            className={cn(
              'px-6 py-3 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2 -mb-px',
              tab === t
                ? 'border-foreground text-foreground font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'current' ? 'Current Block' : t === 'history' ? `History (${archivedPrograms.length})` : 'Analytics'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'current' && (
        activeProgram ? (
          <CurrentBlockView
            program={activeProgram}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeekId}
            onStartWorkout={onStartWorkout}
          />
        ) : (
          <NoProgramState onBack={onBack} />
        )
      )}

      {tab === 'history' && <HistoryView archivedPrograms={archivedPrograms} />}

      {tab === 'analytics' && <AnalyticsDashboard client={client} />}

      {/* Version footer */}
      <div className="text-center text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest pt-4">
        IronTrack v{__APP_VERSION__}
      </div>
    </div>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function CurrentBlockView({
  program,
  selectedWeek,
  onSelectWeek,
  onStartWorkout,
}: {
  program: Program;
  selectedWeek: WorkoutWeek | undefined;
  onSelectWeek: (id: string) => void;
  onStartWorkout: (week: WorkoutWeek, day: WorkoutDay) => void;
}) {
  return (
    <div className="space-y-10">
      {/* Week selector */}
      <div className="flex space-x-4 border-b border-border pb-6 overflow-x-auto no-scrollbar">
        {program.weeks.map((week) => (
          <button
            key={week.id}
            onClick={() => onSelectWeek(week.id)}
            data-testid={`week-tab-${week.weekNumber}`}
            className={cn(
              'px-6 py-3 text-xs font-mono uppercase tracking-widest transition-all whitespace-nowrap border',
              selectedWeek?.id === week.id
                ? 'bg-foreground text-background font-bold border-foreground shadow-lg'
                : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border'
            )}
          >
            Week {week.weekNumber}
          </button>
        ))}
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <AnimatePresence mode="popLayout">
          {selectedWeek?.days.map((day, idx) => (
            <motion.div
              key={day.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <TechnicalCard className="hover:shadow-lg transition-shadow">
                <div className="p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                        Day {day.dayNumber}
                      </p>
                      <h3 className="text-3xl font-bold text-foreground italic font-serif tracking-tight">
                        {day.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => onStartWorkout(selectedWeek, day)}
                      data-testid={`log-session-btn-day-${day.dayNumber}`}
                      className="border-2 border-foreground text-foreground px-6 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-all shadow-sm"
                    >
                      Log Session
                    </button>
                  </div>

                  <div className="space-y-4">
                    {day.exercises.map((ex, i) => (
                      <div
                        key={ex.id}
                        className="flex justify-between items-center text-xs font-mono py-3 border-b border-border last:border-0 group"
                      >
                        <div className="flex items-center">
                          <span className="text-muted-foreground/40 mr-4 group-hover:text-foreground transition-colors">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="text-foreground font-medium">{ex.exerciseName}</span>
                        </div>
                        <span className="text-muted-foreground bg-muted/30 px-2 py-1 rounded-sm">
                          {ex.sets} × {ex.reps}{ex.expectedRpe ? ` @${ex.expectedRpe}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </TechnicalCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HistoryView({ archivedPrograms }: { archivedPrograms: Program[] }) {
  if (archivedPrograms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="history-empty">
        <Archive className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-bold italic font-serif">No Archived Blocks Yet</h3>
        <p className="text-muted-foreground font-mono text-xs mt-2 uppercase tracking-widest">
          Completed cycles will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="history-grid">
      {archivedPrograms.map((p) => {
        const totalDays = p.weeks.reduce((s, w) => s + w.days.length, 0);
        const loggedDays = p.weeks.reduce(
          (s, w) => s + w.days.filter((d) => d.loggedAt).length,
          0
        );
        return (
          <TechnicalCard key={p.id}>
            <div className="p-6 space-y-4" data-testid={`history-card-${p.id}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                    Archived Block
                  </p>
                  <h3 className="text-2xl font-bold italic font-serif tracking-tight">{p.name}</h3>
                </div>
                <Archive className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <Stat label="Weeks" value={String(p.weeks.length)} />
                <Stat label="Sessions" value={`${loggedDays}/${totalDays}`} />
                <Stat
                  label="Archived"
                  value={p.archivedAt ? new Date(p.archivedAt).toLocaleDateString() : '—'}
                />
              </div>
            </div>
          </TechnicalCard>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">{label}</p>
      <p className="text-sm font-bold font-mono text-foreground mt-1">{value}</p>
    </div>
  );
}

function NoProgramState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
      <h2 className="text-2xl font-bold italic font-serif">No Program Assigned</h2>
      <p className="text-muted-foreground font-mono text-sm mt-2">
        Contact your coach to assign a training block.
      </p>
      <button
        onClick={onBack}
        className="mt-8 text-xs font-bold uppercase tracking-widest underline"
      >
        Back
      </button>
    </div>
  );
}