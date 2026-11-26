import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  tone?: 'default' | 'error';
}

export function Toast({ message, tone = 'default' }: ToastProps) {
  return (
    <div
      className={`toast ${tone === 'error' ? 'error' : ''}`}
      role="status"
      aria-live="polite"
    >
      {tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      <span>{message}</span>
    </div>
  );
}
