import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** GET a path; refetch() and pull-to-refresh reuse the loaded data instead of flashing a spinner. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const ticket = ++latest.current;
    try {
      const result = await api<T>(path);
      if (ticket === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (ticket === latest.current) setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(path !== null);
    void load();
  }, [load, path]);

  return { data, error, loading, refetch: load, setData };
}
