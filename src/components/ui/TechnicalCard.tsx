import React from 'react';
import { cn } from '../../lib/utils';

interface TechnicalCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TechnicalCard({ children, className, onClick }: TechnicalCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card border border-border rounded-sm overflow-hidden shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}
