import { useState, useMemo } from 'react';
import { TrendingUp, Activity, AlertCircle } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TechnicalCard } from '../ui';
import { cn } from '../../lib/utils';
import {
  aggregateE1RM,
  aggregateReadiness,
  listLoggedExercises,
} from '../../lib/analytics';
import type { Client } from '../../types';

interface AnalyticsDashboardProps {
  client: Client;
}

export function AnalyticsDashboard({ client }: AnalyticsDashboardProps) {
  const exercises = useMemo(() => listLoggedExercises(client), [client]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exercises[0]?.id ?? ''
  );

  const e1rmData = useMemo(
    () => (selectedExerciseId ? aggregateE1RM(client, selectedExerciseId) : []),
    [client, selectedExerciseId]
  );

  const readinessData = useMemo(() => aggregateReadiness(client), [client]);

  return (
    <div className="space-y-10" data-testid="analytics-dashboard">
      {/* ── Chart A: Performance / e1RM ───────────────────────────────── */}
      <TechnicalCard>
        <div className="p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-foreground text-background flex items-center justify-center rounded-sm">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold italic font-serif tracking-tight">
                  Estimated 1RM
                </h3>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">
                  Epley Formula · Performance Trend
                </p>
              </div>
            </div>

            {/* Exercise selector */}
            {exercises.length > 0 && (
              <div className="flex flex-wrap gap-2 max-w-md justify-end">
                {exercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExerciseId(ex.id)}
                    data-testid={`exercise-tab-${ex.id}`}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border transition-all',
                      selectedExerciseId === ex.id
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    )}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {e1rmData.length === 0 ? (
            <EmptyChart message="No logged actuals yet — log a session to see your e1RM trend." />
          ) : (
            <div className="h-72" data-testid="e1rm-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={e1rmData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="date" stroke="currentColor" fontSize={10} fontFamily="monospace" opacity={0.6} />
                  <YAxis stroke="currentColor" fontSize={10} fontFamily="monospace" opacity={0.6} unit="kg" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    name="e1RM (kg)"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </TechnicalCard>

      {/* ── Chart B: Fatigue / Readiness ──────────────────────────────── */}
      <TechnicalCard>
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-foreground text-background flex items-center justify-center rounded-sm">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-bold italic font-serif tracking-tight">
                Readiness
              </h3>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">
                Self-Reported · 1–10 · Fatigue Trend
              </p>
            </div>
          </div>

          {readinessData.length === 0 ? (
            <EmptyChart message="No readiness scores logged yet — set readiness when saving a session." />
          ) : (
            <div className="h-72" data-testid="readiness-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={readinessData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="date" stroke="currentColor" fontSize={10} fontFamily="monospace" opacity={0.6} />
                  <YAxis domain={[0, 10]} stroke="currentColor" fontSize={10} fontFamily="monospace" opacity={0.6} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '2px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="readiness"
                    name="Readiness"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </TechnicalCard>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-chart">
      <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
      <p className="text-xs font-mono text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}