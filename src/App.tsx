import React, { useState, useEffect } from 'react';
import { Dumbbell, ShieldCheck, Sun, Moon, UserPlus, X, ChevronRight, Users, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { useAuth } from './hooks/useAuth';
import { useProgramData } from './hooks/useProgramData';
import { TechnicalCard, TechnicalInput, Modal } from './components/ui';
import { AdminView } from './components/admin/AdminView';
import { SuperadminView } from './components/admin/SuperadminView';
import { ClientDashboard } from './components/trainee/ClientDashboard';
import { WorkoutGridLogger } from './components/trainee/WorkoutGridLogger';
import { RestTimer } from './components/trainee/RestTimer';
import { SignupPage } from './components/auth/SignupPage';
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage';
import { checkPasswordStrength } from './lib/crypto';
import type { Client, WorkoutWeek, WorkoutDay, UserRole } from './types';

// ─── Coach: Client list view ─────────────────────────────────────────────────

function ClientListView({
  clients,
  onSelectClient,
  onAddClient,
}: {
  clients: Client[];
  onSelectClient: (c: Client) => void;
  onAddClient: () => void;
}) {
  const trainees = clients.filter((c) => c.role === 'trainee');
  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-5xl font-bold tracking-tighter uppercase italic font-serif text-foreground">
            Clients
          </h1>
          <p className="text-muted-foreground font-mono text-xs mt-1 uppercase tracking-widest">
            Active Training Management
          </p>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAddClient}
          className="bg-foreground text-background px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center hover:opacity-90 transition-all shadow-lg"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          New Client
        </motion.button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trainees.map((client, idx) => (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <TechnicalCard className="group cursor-pointer hover:border-muted-foreground transition-all hover:shadow-xl hover:-translate-y-1">
              <div onClick={() => onSelectClient(client)} className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-muted flex items-center justify-center rounded-sm group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Status</p>
                    <p className="text-[10px] text-green-500 font-mono uppercase font-bold">Active</p>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-1 tracking-tight">{client.name}</h3>
                <p className="text-xs text-muted-foreground font-mono mb-6">{client.email}</p>
                <div className="border-t border-border pt-6 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Program</p>
                    <p className="text-sm text-foreground font-mono font-medium">
                      {client.programs[0]?.name ?? 'No Program'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </TechnicalCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Landing / Login ─────────────────────────────────────────────────────────

function LandingPage({
  onLogin,
  onSignup,
  onForgot,
  loginError,
  isBootstrapping,
  theme,
  onToggleTheme,
}: {
  onLogin: (email: string, password: string) => void;
  onSignup: () => void;
  onForgot: () => void;
  loginError: string;
  isBootstrapping: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex justify-between items-center p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-foreground flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-background" />
          </div>
          <span className="text-lg font-bold uppercase tracking-widest font-mono">IronTrack</span>
        </div>
        <button onClick={onToggleTheme} className="p-2 hover:bg-muted rounded-sm transition-colors">
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </nav>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-7xl font-bold tracking-tighter uppercase italic font-serif leading-none">
              Iron<br />Track
            </h1>
            <p className="text-muted-foreground font-mono text-xs mt-4 uppercase tracking-widest">
              Unified Training Management System
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <TechnicalCard>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    Email
                  </label>
                  <div className="bg-muted/30 p-4 border border-border">
                    <TechnicalInput
                      value={email}
                      onChange={setEmail}
                      placeholder="you@example.com"
                      type="email"
                      data-testid="login-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    Password
                  </label>
                  <div className="bg-muted/30 p-4 border border-border">
                    <TechnicalInput
                      value={password}
                      onChange={setPassword}
                      placeholder="••••••••"
                      type="password"
                      data-testid="login-password"
                    />
                  </div>
                </div>

                {loginError && (
                  <p className="text-red-500 font-mono text-xs">{loginError}</p>
                )}

                <button
                  onClick={() => onLogin(email, password)}
                  disabled={isBootstrapping}
                  data-testid="login-btn"
                  className="w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg disabled:opacity-40 disabled:cursor-wait"
                >
                  {isBootstrapping ? 'Initialising...' : 'Enter System'}
                </button>

                <div className="flex justify-between">
                  <button
                    onClick={onForgot}
                    data-testid="goto-forgot-btn"
                    className="text-xs font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest"
                  >
                    Forgot Password?
                  </button>
                  <button
                    onClick={onSignup}
                    data-testid="goto-signup-btn"
                    className="text-xs font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest"
                  >
                    Sign Up
                  </button>
                </div>
              </div>
            </TechnicalCard>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Client Modal ────────────────────────────────────────────────────────

function AddClientModal({
  isOpen,
  onClose,
  onAdd,
  tenantId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, email: string, password: string, role: UserRole, tenantId?: string) => Promise<Client>;
  tenantId?: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setConfirm('');
    setErrors([]); setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleAdd = async () => {
    const errs: string[] = [];
    if (!name.trim())  errs.push('Name is required.');
    if (!email.trim()) errs.push('Email is required.');

    const strength = checkPasswordStrength(password);
    if (!strength.ok) errs.push(...strength.errors.map((e) => `Password: ${e}`));
    if (password !== confirm) errs.push('Passwords do not match.');

    if (errs.length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    await onAdd(name.trim(), email.trim(), password, 'trainee', tenantId);
    reset();
    onClose();
  };

  const strength = checkPasswordStrength(password);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Client">
      <div className="space-y-5">
        {[
          { label: 'Full Name', value: name,     set: setName,     placeholder: 'John Doe',          testId: 'new-client-name',     type: 'text' },
          { label: 'Email',     value: email,    set: setEmail,    placeholder: 'john@example.com',  testId: 'new-client-email',    type: 'email' },
          { label: 'Password',  value: password, set: setPassword, placeholder: 'Min 8 chars, 1 letter, 1 number', testId: 'new-client-password', type: 'password' },
          { label: 'Confirm Password', value: confirm, set: setConfirm, placeholder: '••••••••', testId: 'new-client-confirm', type: 'password' },
        ].map(({ label, value, set, placeholder, testId, type }) => (
          <div key={label} className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              {label}
            </label>
            <div className="bg-muted/30 p-4 border border-border">
              <TechnicalInput
                value={value}
                onChange={set}
                placeholder={placeholder}
                type={type}
                data-testid={testId}
              />
            </div>
          </div>
        ))}

        {/* Password strength indicator */}
        {password.length > 0 && (
          <div className="space-y-1">
            {strength.errors.map((e) => (
              <p key={e} className="text-[10px] font-mono text-amber-500">{e}</p>
            ))}
            {strength.ok && (
              <p className="text-[10px] font-mono text-green-500">Password meets requirements</p>
            )}
          </div>
        )}

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="space-y-1">
            {errors.map((e) => (
              <p key={e} className="text-[10px] font-mono text-red-500">{e}</p>
            ))}
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={submitting}
          className="w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Client'}
        </button>
      </div>
    </Modal>
  );
}

// ─── App Shell (authenticated layout) ───────────────────────────────────────

function AppShell({
  children,
  authenticatedUser,
  theme,
  onToggleTheme,
  onLogout,
  onGoAdmin,
  impersonating,
  onStopImpersonating,
}: {
  children: React.ReactNode;
  authenticatedUser: Client;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  onGoAdmin: () => void;
  impersonating?: Client | null;
  onStopImpersonating?: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Impersonation banner */}
      {impersonating && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs font-mono uppercase tracking-widest flex justify-between items-center">
          <span>Viewing as: {authenticatedUser.name} (Tenant: {authenticatedUser.tenantId})</span>
          <button
            onClick={onStopImpersonating}
            data-testid="stop-impersonate-btn"
            className="flex items-center gap-2 px-3 py-1 border border-white/30 hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Superadmin
          </button>
        </div>
      )}
      <nav className="flex justify-between items-center px-8 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-md z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-foreground flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-background" />
          </div>
          <span className="text-lg font-bold uppercase tracking-widest font-mono">IronTrack</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-xs font-mono text-muted-foreground hidden sm:block">
            {authenticatedUser.name}
          </span>
          {authenticatedUser.role === 'admin' && (
            <button
              onClick={onGoAdmin}
              data-testid="admin-btn"
              className="flex items-center space-x-2 px-4 py-2 border border-border hover:border-muted-foreground text-xs font-mono uppercase transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin</span>
            </button>
          )}
          <button onClick={onToggleTheme} className="p-2 hover:bg-muted rounded-sm transition-colors">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-muted rounded-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">{children}</main>
    </div>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  const { clients, isBootstrapping, updateClients, addClient, saveSession, resetPassword, archiveProgram, getClientsForTenant } = useProgramData();
  const { authenticatedUser, view, loginError, login, logout, setView, impersonating, impersonate, stopImpersonating } = useAuth();

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<{ week: WorkoutWeek; day: WorkoutDay } | null>(null);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Apply theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('irontrack_theme', theme);
  }, [theme]);

  // Restore theme preference
  useEffect(() => {
    const saved = localStorage.getItem('irontrack_theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const handleLogin = async (email: string, password: string) => {
    await login(clients, email, password);
  };

  const handleSignupComplete = async (name: string, email: string, password: string, tenantId: string) => {
    const newUser = await addClient(name, email, password, 'trainee', tenantId);
    // Auto-login the new user
    await login(clients.concat(newUser), email, password);
  };

  const handleSaveSession = (updatedDay: WorkoutDay) => {
    if (!selectedClient || !activeWorkout) return;
    const program =
      selectedClient.programs.find((p) => p.id === selectedClient.activeProgramId && p.status !== 'archived') ??
      selectedClient.programs.find((p) => p.status !== 'archived');
    if (!program) return;
    saveSession(selectedClient.id, program.id, activeWorkout.week.id, updatedDay);
    setActiveWorkout(null);
  };

  const handleAddCoach = async (name: string, email: string, password: string) => {
    const coachId = Math.random().toString(36).substring(7);
    return await addClient(name, email, password, 'admin', coachId);
  };

  // Keep selectedClient in sync with the clients store (e.g. after coach edits)
  useEffect(() => {
    if (selectedClient) {
      const refreshed = clients.find((c) => c.id === selectedClient.id);
      if (refreshed) setSelectedClient(refreshed);
    }
  }, [clients]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-set selectedClient for trainees on login
  useEffect(() => {
    if (authenticatedUser?.role === 'trainee') {
      const fresh = clients.find((c) => c.id === authenticatedUser.id);
      if (fresh) setSelectedClient(fresh);
    }
  }, [authenticatedUser, clients]);

  // Tenant-scoped clients for the current user
  const tenantClients = authenticatedUser ? getClientsForTenant(authenticatedUser) : [];

  // ── Signup ──────────────────────────────────────────────────────────────

  if (view === 'signup') {
    return (
      <SignupPage
        onComplete={handleSignupComplete}
        onBack={() => setView('landing')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // ── Forgot Password ──────────────────────────────────────────────────

  if (view === 'forgot') {
    return (
      <ForgotPasswordPage
        clients={clients}
        onResetPassword={resetPassword}
        onBack={() => setView('landing')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // ── Landing / Login ────────────────────────────────────────────────────

  if (!authenticatedUser || view === 'landing') {
    return (
      <LandingPage
        onLogin={handleLogin}
        onSignup={() => setView('signup')}
        onForgot={() => setView('forgot')}
        loginError={loginError}
        isBootstrapping={isBootstrapping}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // ── Superadmin view ────────────────────────────────────────────────────

  if (view === 'superadmin' && authenticatedUser.role === 'superadmin') {
    return (
      <AppShell
        authenticatedUser={authenticatedUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        onGoAdmin={() => {}}
      >
        <SuperadminView
          clients={clients}
          onAddCoach={handleAddCoach}
          onImpersonate={impersonate}
        />
      </AppShell>
    );
  }

  // ── Active workout logger ──────────────────────────────────────────────

  if (activeWorkout && selectedClient) {
    const program =
      selectedClient.programs.find((p) => p.id === selectedClient.activeProgramId && p.status !== 'archived') ??
      selectedClient.programs.find((p) => p.status !== 'archived') ??
      selectedClient.programs[0];

    return (
      <AppShell
        authenticatedUser={authenticatedUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        onGoAdmin={() => setView('admin')}
        impersonating={impersonating}
        onStopImpersonating={stopImpersonating}
      >
        <WorkoutGridLogger
          client={selectedClient}
          program={program}
          week={activeWorkout.week}
          day={activeWorkout.day}
          onBack={() => setActiveWorkout(null)}
          onSave={handleSaveSession}
        />
        <RestTimer />
      </AppShell>
    );
  }

  // ── Admin view ─────────────────────────────────────────────────────────

  if (view === 'admin') {
    if (authenticatedUser.role !== 'admin' && authenticatedUser.role !== 'superadmin') {
      setView('trainee');
      return null;
    }
    return (
      <AppShell
        authenticatedUser={authenticatedUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        onGoAdmin={() => setView('admin')}
        impersonating={impersonating}
        onStopImpersonating={stopImpersonating}
      >
        <AdminView
          clients={clients}
          authenticatedUser={authenticatedUser}
          onUpdateClients={updateClients}
          onResetPassword={resetPassword}
          onArchiveProgram={archiveProgram}
          onBack={() => {
            if (impersonating) {
              stopImpersonating();
            } else {
              setView('coach');
            }
          }}
        />
      </AppShell>
    );
  }

  // ── Client dashboard (trainee or coach drilling into a client) ─────────

  if (selectedClient && (view === 'trainee' || view === 'coach')) {
    return (
      <AppShell
        authenticatedUser={authenticatedUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        onGoAdmin={() => setView('admin')}
        impersonating={impersonating}
        onStopImpersonating={stopImpersonating}
      >
        <ClientDashboard
          client={selectedClient}
          onBack={() => {
            if (authenticatedUser.role === 'admin' || impersonating) {
              setSelectedClient(null);
              setView('coach');
            } else {
              logout();
            }
          }}
          onStartWorkout={(week, day) => setActiveWorkout({ week, day })}
        />
      </AppShell>
    );
  }

  // ── Coach: client list ─────────────────────────────────────────────────

  if (authenticatedUser.role !== 'admin' && !impersonating) {
    // Trainee with no selectedClient yet (edge case during bootstrap)
    return null;
  }

  return (
    <AppShell
      authenticatedUser={authenticatedUser}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={logout}
      onGoAdmin={() => setView('admin')}
      impersonating={impersonating}
      onStopImpersonating={stopImpersonating}
    >
      <AnimatePresence mode="wait">
        <ClientListView
          clients={tenantClients}
          onSelectClient={(c) => { setSelectedClient(c); setView('coach'); }}
          onAddClient={() => setIsAddClientOpen(true)}
        />
      </AnimatePresence>
      <AddClientModal
        isOpen={isAddClientOpen}
        onClose={() => setIsAddClientOpen(false)}
        onAdd={addClient}
        tenantId={authenticatedUser.tenantId}
      />
    </AppShell>
  );
}