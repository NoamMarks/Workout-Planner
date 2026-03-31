import React, { useState, useEffect } from 'react';
import { Modal, TechnicalInput } from '../ui';
import { cn } from '../../lib/utils';
import type { ProgramColumn } from '../../types';

interface ColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingColumn: ProgramColumn | null;
  onSave: (label: string, type: 'plan' | 'actual') => void;
}

export function ColumnModal({ isOpen, onClose, editingColumn, onSave }: ColumnModalProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'plan' | 'actual'>('plan');

  // Sync form to the column being edited
  useEffect(() => {
    if (editingColumn) {
      setLabel(editingColumn.label);
      setType(editingColumn.type);
    } else {
      setLabel('');
      setType('plan');
    }
  }, [editingColumn, isOpen]);

  const handleSave = () => {
    if (!label.trim()) return;
    onSave(label.trim(), type);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingColumn ? 'Edit Column' : 'Add New Column'}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Column Label
          </label>
          <div className="bg-muted/30 p-4 border border-border">
            <TechnicalInput
              value={label}
              onChange={setLabel}
              placeholder="e.g. Tempo, Rest, Target Load"
              data-testid="column-label-input"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Column Type
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setType('plan')}
              className={cn(
                'p-4 border text-xs font-bold uppercase tracking-widest transition-all',
                type === 'plan'
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              Plan (Coach Sets)
            </button>
            <button
              onClick={() => setType('actual')}
              className={cn(
                'p-4 border text-xs font-bold uppercase tracking-widest transition-all',
                type === 'actual'
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              Actual (Trainee Logs)
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!label.trim()}
          data-testid="save-column-btn"
          className="w-full bg-foreground text-background py-4 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg disabled:opacity-40"
        >
          {editingColumn ? 'Save Changes' : 'Create Column'}
        </button>
      </div>
    </Modal>
  );
}
