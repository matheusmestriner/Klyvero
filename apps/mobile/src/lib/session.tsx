import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { restoreSession, setSignedOutHandler, signIn as apiSignIn, signOut as apiSignOut, type Session } from './api';
import { registerForPush, unregisterPush } from './push';

type State = { status: 'loading' } | { status: 'out' } | { status: 'in'; session: Session };

type Value = {
  state: State;
  signIn: (input: { tenantSlug: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Value | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    setSignedOutHandler(() => setState({ status: 'out' }));
    restoreSession().then((session) => {
      setState(session ? { status: 'in', session } : { status: 'out' });
      if (session) void registerForPush();
    });
    return () => setSignedOutHandler(null);
  }, []);

  const signIn = useCallback<Value['signIn']>(async (input) => {
    const session = await apiSignIn(input);
    setState({ status: 'in', session });
    void registerForPush();
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush(); // needs the access token, so before the session is cleared
    await apiSignOut();
    setState({ status: 'out' });
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
