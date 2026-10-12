import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Toasts per DESIGN.md: bottom-right, auto-dismiss after 5 s, errors stay until dismissed.
const ToastContext = createContext(null);
const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 3;
const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

let nextId = 1;

function ToastItem({ toast, onDismiss }) {
  const Icon = ICONS[toast.tone] ?? Info;
  useEffect(() => {
    if (toast.tone === 'error' || toast.duration === Infinity) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? DEFAULT_DURATION);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);
  return (
    <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" className="toast-icon" />
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          className="btn-ghost btn-compact"
          onClick={() => {
            onDismiss(toast.id);
            toast.action.onClick();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="btn-ghost btn-compact btn-icon" aria-label="Schliessen" title="Schliessen" onClick={() => onDismiss(toast.id)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((message, options = {}) => {
    const id = nextId++;
    const toast = { id, message, tone: options.tone ?? 'success', action: options.action, duration: options.duration };
    setToasts((list) => [...list.filter((t) => !options.replace || t.replace !== options.replace), { ...toast, replace: options.replace }].slice(-MAX_VISIBLE));
    return id;
  }, []);
  const api = useMemo(
    () => ({
      show,
      success: (message, options) => show(message, { ...options, tone: 'success' }),
      error: (message, options) => show(message, { ...options, tone: 'error' }),
      info: (message, options) => show(message, { ...options, tone: 'info' }),
      dismiss,
    }),
    [show, dismiss],
  );
  const regionRef = useRef(null);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" ref={regionRef} aria-label="Benachrichtigungen" role="region">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
