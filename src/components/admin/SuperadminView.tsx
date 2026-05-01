import { useState } from 'react';
import { Shield, Users, Eye, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TechnicalCard, TechnicalInput, Modal } from '../ui';
import { checkPasswordStrength } from '../../lib/crypto';
import { isValidEmail, INVALID_EMAIL_MESSAGE } from '../../lib/validation';
import type { Client } from '../../types';

interface SuperadminViewProps {
  clients: Client[];
  onAddCoach: (name: string, email: string, password: string) => Promise<Client>;
  onImpersonate: (coach: Client) => void;
}

export function SuperadminView({ clients, onAddCoach, onImpersonate }: SuperadminViewProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const coaches = clients.filter((c) => c.role === 'admin');

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-end">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 text-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              Superadmin Control Center
            </span>
          </div>
          <h1 className="text-5xl font-bold tracking-tighter uppercase italic font-serif text-foreground">
            All Coaches
          </h1>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsCreateOpen(true)}
          data-testid="create-coach-btn"
          className="bg-foreground text-background px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center hover:opacity-90 transition-all shadow-lg"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          New Coach
        </motion.button>
      </header>

      {coaches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <Users className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-bold italic font-serif">No Coaches Yet</h3>
          <p className="text-muted-foreground font-mono text-xs mt-2 uppercase tracking-widest">
            Create a coach account to get started
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {coaches.map((coach, idx) => {
              const trainees = clients.filter(
                (c) => c.role === 'trainee' && c.tenantId === coach.tenantId
              );
              return (
                <motion.div
                  key={coach.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <TechnicalCard className="hover:border-muted-foreground transition-all">
                    <div className="p-6 space-y-5" data-testid={`coach-card-${coach.id}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-bold tracking-tight">{coach.name}</h3>
                          <p className="text-xs font-mono text-muted-foreground mt-1">{coach.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => onImpersonate(coach)}
                            data-testid={`impersonate-${coach.id}`}
                            className="p-2 border border-border hover:border-muted-foreground hover:bg-muted/30 transition-colors rounded-sm"
                            title="View as this coach"
                          >
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div>
                          <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">
                            Tenant ID
                          </p>
                          <p className="text-sm font-bold font-mono text-foreground mt-1">{coach.tenantId}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">
                            Clients
                          </p>
                          <p className="text-sm font-bold font-mono text-foreground mt-1">{trainees.length}</p>
                        </div>
                      </div>
                    </div>
                  </TechnicalCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <CreateCoachModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onAdd={onAddCoach}
      />
    </div>
  );
}

// ─── Create Coach Modal ─────────────────────────────────────────────────────

function CreateCoachModal({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, email: string, password: string) => Promise<Client>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setConfirm('');
    setErrors([]); setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleAdd = async () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Name is required.');
    if (!email.trim()) errs.push('Email is required.');
    else if (!isValidEmail(email)) errs.push(INVALID_EMAIL_MESSAGE);
    const strength = checkPasswordStrength(password);
    if (!strength.ok) errs.push(...strength.errors.map((e) => `Password: ${e}`));
    if (password !== confirm) errs.push('Passwords do not match.');
    if (errs.length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    await onAdd(name.trim(), email.trim(), password);
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Coach Account">
      <div className="space-y-5">
        {[
          { label: 'Full Name', value: name, set: setName, placeholder: 'Coach Name', testId: 'new-coach-name', type: 'text' },
          { label: 'Email', value: email, set: setEmail, placeholder: 'coach@example.com', testId: 'new-coach-email', type: 'email' },
          { label: 'Password', value: password, set: setPassword, placeholder: 'Min 8 chars, 1 letter, 1 number', testId: 'new-coach-password', type: 'password' },
          { label: 'Confirm', value: confirm, set: setConfirm, placeholder: '••••••••', testId: 'new-coach-confirm', type: 'password' },
        ].map(({ label, value, set, placeholder, testId, type }) => (
          <div key={label} className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              {label}
            </label>
            <div className="field-wrap">
              <TechnicalInput value={value} onChange={set} placeholder={placeholder} type={type} data-testid={testId} />
            </div>
          </div>
        ))}

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
          className="btn-press w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest rounded-input hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Coach'}
        </button>
      </div>
    </Modal>
  );
}