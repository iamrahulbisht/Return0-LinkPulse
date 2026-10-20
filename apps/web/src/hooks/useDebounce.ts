import { useEffect, useState } from 'react';

/** The value, but only after it stopped changing for `ms` (the wizard checks 300 ms after typing). */
export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
