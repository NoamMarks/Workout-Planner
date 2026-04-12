import { useState, useEffect, useCallback } from 'react';
import type { Client, Program, WorkoutDay, ExercisePlan, ProgramColumn, UserRole } from '../types';
import { INITIAL_CLIENTS, DEFAULT_COLUMNS, SUPERADMIN_EMAIL } from '../constants/mockData';
import { hashPassword, isHashed } from '../lib/crypto';

const STORAGE_KEY = 'irontrack_clients';

// ─── Migration helper ────────────────────────────────────────────────────────

async function migrateClients(raw: unknown[]): Promise<Client[]> {
  let clients: Client[] = await Promise.all(
    raw.map(async (c: unknown) => {
      const client = c as Record<string, unknown>;
      const rawPassword = (client.password as string) ?? 'changeme';
      const password = isHashed(rawPassword) ? rawPassword : await hashPassword(rawPassword);

      // Migrate legacy 'coach' role → 'admin'
      let role = (client.role as string) ?? 'trainee';
      if (role === 'coach') role = 'admin';

      return {
        ...(client as unknown as Client),
        role: role as UserRole,
        password,
        tenantId: (client.tenantId as string | undefined),
        programs: ((client.programs as unknown[]) ?? []).map((p: unknown) => {
          const prog = p as Record<string, unknown>;
          return {
            ...(prog as unknown as Program),
            status: ((prog.status as 'active' | 'archived') ?? 'active'),
            columns: (prog.columns as ProgramColumn[]) ?? [...DEFAULT_COLUMNS],
            tenantId: (prog.tenantId as string | undefined),
            weeks: ((prog.weeks as unknown[]) ?? []).map((w: unknown) => {
              const week = w as Record<string, unknown>;
              return {
                ...(week as unknown as Program['weeks'][0]),
                days: ((week.days as unknown[]) ?? []).map((d: unknown) => {
                  const day = d as Record<string, unknown>;
                  return {
                    ...(day as unknown as WorkoutDay),
                    exercises: ((day.exercises as unknown[]) ?? []).map((ex: unknown) => ({
                      ...(ex as ExercisePlan),
                      values:
                        ((ex as Record<string, unknown>).values as Record<string, string>) ?? {},
                    })),
                  };
                }),
              };
            }),
          };
        }),
      };
    })
  );

  // Force-migrate the superadmin account — stale localStorage may have the
  // wrong role/tenantId from before the multi-tenant sprint.
  const superadminEmail = SUPERADMIN_EMAIL.toLowerCase();
  const existingSA = clients.find((c) => c.email.toLowerCase() === superadminEmail);
  if (existingSA) {
    existingSA.role = 'superadmin';
    existingSA.tenantId = 'global';
  } else {
    // Superadmin doesn't exist at all — bootstrap from seed data
    const hashedSA = await hashInitialClients([INITIAL_CLIENTS[0]]);
    clients = [...hashedSA, ...clients];
  }

  // Ensure at least one admin (coach) exists
  if (!clients.some((c) => c.role === 'admin')) {
    const coachSeed = INITIAL_CLIENTS.find((c) => c.role === 'admin');
    if (coachSeed) {
      const hashedCoach = await hashInitialClients([coachSeed]);
      clients = [...clients, ...hashedCoach];
    }
  }

  return clients;
}

async function hashInitialClients(list: Client[]): Promise<Client[]> {
  return Promise.all(
    list.map(async (c) => ({
      ...c,
      password: isHashed(c.password ?? '') ? (c.password ?? '') : await hashPassword(c.password ?? ''),
    }))
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProgramData() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as unknown[];
          const migrated = await migrateClients(parsed);
          setClients(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        } catch {
          const initial = await hashInitialClients(INITIAL_CLIENTS);
          setClients(initial);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        }
      } else {
        const initial = await hashInitialClients(INITIAL_CLIENTS);
        setClients(initial);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      }
      setIsBootstrapping(false);
    }
    bootstrap();
  }, []);

  const updateClients = useCallback((updated: Client[]) => {
    setClients(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const addClient = useCallback(
    async (name: string, email: string, password: string, role: UserRole = 'trainee', tenantId?: string) => {
      const hashed = await hashPassword(password);
      const newClient: Client = {
        id: Math.random().toString(36).substring(7),
        name,
        email,
        password: hashed,
        role,
        tenantId,
        programs: [],
      };
      updateClients([...clients, newClient]);
      return newClient;
    },
    [clients, updateClients]
  );

  const resetPassword = useCallback(
    async (clientId: string, newPassword: string) => {
      const hashed = await hashPassword(newPassword);
      updateClients(clients.map((c) => (c.id === clientId ? { ...c, password: hashed } : c)));
    },
    [clients, updateClients]
  );

  const saveSession = useCallback(
    (clientId: string, programId: string, weekId: string, updatedDay: WorkoutDay) => {
      const stampedDay: WorkoutDay = { ...updatedDay, loggedAt: new Date().toISOString() };
      const updated = clients.map((c) => {
        if (c.id !== clientId) return c;
        return {
          ...c,
          programs: c.programs.map((p) => {
            if (p.id !== programId) return p;
            return {
              ...p,
              weeks: p.weeks.map((w) => {
                if (w.id !== weekId) return w;
                return {
                  ...w,
                  days: w.days.map((d) => (d.id === stampedDay.id ? stampedDay : d)),
                };
              }),
            };
          }),
        };
      });
      updateClients(updated);
    },
    [clients, updateClients]
  );

  const deleteClient = useCallback(
    (clientId: string) => {
      updateClients(clients.filter((c) => c.id !== clientId));
    },
    [clients, updateClients]
  );

  const archiveProgram = useCallback(
    (clientId: string, programId: string) => {
      const updated = clients.map((c) => {
        if (c.id !== clientId) return c;
        const wasActive = c.activeProgramId === programId;
        return {
          ...c,
          activeProgramId: wasActive ? undefined : c.activeProgramId,
          programs: c.programs.map((p) =>
            p.id === programId
              ? { ...p, status: 'archived' as const, archivedAt: new Date().toISOString() }
              : p
          ),
        };
      });
      updateClients(updated);
    },
    [clients, updateClients]
  );

  /**
   * Filter clients by tenant. Superadmin sees all; coaches see only their tenant.
   */
  const getClientsForTenant = useCallback(
    (user: Client): Client[] => {
      if (user.role === 'superadmin') return clients;
      return clients.filter((c) => c.tenantId === user.tenantId && c.id !== user.id);
    },
    [clients]
  );

  return {
    clients,
    isBootstrapping,
    updateClients,
    addClient,
    saveSession,
    deleteClient,
    resetPassword,
    archiveProgram,
    getClientsForTenant,
  };
}