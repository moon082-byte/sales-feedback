import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, AUTH_EXPIRED_EVENT, tokenStore, type PublicUser, type UserSettings } from '../api/client';

interface AuthState {
  status: 'loading' | 'anon' | 'ready';
  user: PublicUser | null;
  settings: UserSettings | null;
}

interface AuthApi extends AuthState {
  login(code: string): Promise<void>;
  logout(): Promise<void>;
  setUser(user: PublicUser): void;
  setSettings(settings: UserSettings): void;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, settings: null });

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) {
      setState({ status: 'anon', user: null, settings: null });
      return;
    }
    try {
      const me = await api<{ user: PublicUser; settings: UserSettings }>('/me');
      setState({ status: 'ready', user: me.user, settings: me.settings });
    } catch {
      // 401이면 토큰이 지워졌으므로 로그인 화면, 그 외(오프라인 등)도 일단 로그인 화면으로
      setState({ status: tokenStore.get() ? 'loading' : 'anon', user: null, settings: null });
    }
  }, []);

  useEffect(() => {
    void loadMe();
    const onExpired = () => setState({ status: 'anon', user: null, settings: null });
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [loadMe]);

  const value = useMemo<AuthApi>(
    () => ({
      ...state,
      async login(code) {
        const res = await api<{ token: string; user: PublicUser }>('/auth/verify', { method: 'POST', body: { code } });
        tokenStore.set(res.token);
        await loadMe();
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST' });
        } catch {
          /* 서버 실패해도 로컬 로그아웃 */
        }
        tokenStore.clear();
        setState({ status: 'anon', user: null, settings: null });
      },
      setUser(user) {
        setState((s) => ({ ...s, user }));
      },
      setSettings(settings) {
        setState((s) => ({ ...s, settings }));
      },
    }),
    [state, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
