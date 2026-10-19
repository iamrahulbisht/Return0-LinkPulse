import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => undefined);

const STYLE: Record<Kind, string> = {
  ok: 'bg-ink text-white',
  error: 'bg-danger text-white',
  info: 'bg-ink text-white',
};

/** Short messages at the bottom of the screen ("Copied", "Could not save"). Read out by screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((text: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex min-h-[44px] max-w-md items-center gap-3 rounded-input px-4 py-2 text-[14.5px] font-semibold shadow-lg ${STYLE[t.kind]}`}>
            {t.kind === 'ok' && <span aria-hidden className="text-[#86EFAC]">✓</span>}
            {t.kind === 'error' && <span aria-hidden>!</span>}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
