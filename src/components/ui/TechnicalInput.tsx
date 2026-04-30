import { cn } from '../../lib/utils';

interface TechnicalInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  readOnly?: boolean;
  'data-testid'?: string;
}

export function TechnicalInput({
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
  readOnly = false,
  'data-testid': testId,
}: TechnicalInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      data-testid={testId}
      className={cn(
        'bg-transparent border-none outline-none focus:ring-0 text-foreground font-mono text-sm w-full placeholder:text-muted-foreground',
        readOnly && 'cursor-not-allowed opacity-80',
        className
      )}
    />
  );
}
