import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AccountView } from '@reinos/contracts';
import { api, setCsrf } from './api.js';
import { AuthPage } from './ui/AuthPage.js';
import { WorldsPage } from './ui/WorldsPage.js';
import { VillagePage } from './ui/VillagePage.js';

type Route = { name: 'worlds' } | { name: 'village'; worldId: string; villageId: string };

interface Toast {
  id: number;
  kind: 'error' | 'info';
  text: string;
}
const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

function parseHash(): Route {
  const m = /^#\/w\/([0-9a-f-]{36})\/v\/([0-9a-f-]{36})/.exec(window.location.hash);
  return m ? { name: 'village', worldId: m[1]!, villageId: m[2]! } : { name: 'worlds' };
}

export function App() {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>(parseHash);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setCsrf(me.csrfToken);
        setAccount(me.account);
      })
      .catch(() => setAccount(null));
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => {
    window.location.hash = r.name === 'village' ? `#/w/${r.worldId}/v/${r.villageId}` : '#/';
    setRoute(r);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    setCsrf(null);
    setAccount(null);
    go({ name: 'worlds' });
  };

  let page: React.ReactNode;
  if (account === undefined) page = <div className="splash">Cargando…</div>;
  else if (account === null)
    page = (
      <AuthPage
        onAuthenticated={(me) => {
          setCsrf(me.csrfToken);
          setAccount(me.account);
        }}
      />
    );
  else if (route.name === 'village')
    page = (
      <VillagePage
        account={account}
        worldId={route.worldId}
        villageId={route.villageId}
        onBack={() => go({ name: 'worlds' })}
        onLogout={logout}
      />
    );
  else
    page = (
      <WorldsPage
        account={account}
        onEnter={(worldId, villageId) => go({ name: 'village', worldId, villageId })}
        onLogout={logout}
      />
    );

  return (
    <ToastContext.Provider value={toast}>
      {page}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
