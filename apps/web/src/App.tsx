import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AccountView } from '@reinos/contracts';
import { api, setCsrf } from './api.js';
import { AuthPage } from './ui/AuthPage.js';
import { WorldsPage } from './ui/WorldsPage.js';
import { VillagePage } from './ui/VillagePage.js';
import { TrainingPage } from './ui/TrainingPage.js';
import { TacticalArenaPage } from './ui/TacticalArenaPage.js';

type Route =
  | { name: 'worlds' }
  | { name: 'village'; worldId: string; villageId: string }
  | { name: 'training' }
  | { name: 'arena'; matchId: string };

interface Toast {
  id: number;
  kind: 'error' | 'info';
  text: string;
}
const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

function parseHash(): Route {
  const h = window.location.hash;
  const m = /^#\/w\/([0-9a-f-]{36})\/v\/([0-9a-f-]{36})/.exec(h);
  if (m) return { name: 'village', worldId: m[1]!, villageId: m[2]! };
  const a = /^#\/training\/([0-9a-f-]{36})/.exec(h);
  if (a) return { name: 'arena', matchId: a[1]! };
  if (h.startsWith('#/training')) return { name: 'training' };
  return { name: 'worlds' };
}

function hashOf(r: Route): string {
  switch (r.name) {
    case 'village':
      return `#/w/${r.worldId}/v/${r.villageId}`;
    case 'training':
      return '#/training';
    case 'arena':
      return `#/training/${r.matchId}`;
    default:
      return '#/';
  }
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
    window.location.hash = hashOf(r);
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
  else if (route.name === 'training')
    page = (
      <TrainingPage
        account={account}
        onOpen={(matchId) => go({ name: 'arena', matchId })}
        onBack={() => go({ name: 'worlds' })}
      />
    );
  else if (route.name === 'arena')
    page = <TacticalArenaPage matchId={route.matchId} onExit={() => go({ name: 'training' })} />;
  else if (route.name === 'village')
    page = (
      <VillagePage
        account={account}
        worldId={route.worldId}
        villageId={route.villageId}
        onOpenVillage={(villageId) => go({ name: 'village', worldId: route.worldId, villageId })}
        onBack={() => go({ name: 'worlds' })}
        onLogout={logout}
      />
    );
  else
    page = (
      <WorldsPage
        account={account}
        onEnter={(worldId, villageId) => go({ name: 'village', worldId, villageId })}
        onTraining={() => go({ name: 'training' })}
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
