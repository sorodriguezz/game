import { useEffect, useState } from 'react';
import type { AccountView, WorldSummary } from '@reinos/contracts';

import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { JoinWorldDialog } from './JoinWorldDialog.js';

export function WorldsPage({
  account,
  onEnter,
  onLogout,
}: {
  account: AccountView;
  onEnter: (worldId: string, villageId: string) => void;
  onLogout: () => void;
}) {
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .worlds()
      .then(setWorlds)
      .catch((e) => toast('error', describeError(e)));
  }, [toast]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Reinos de la Frontera</div>
        <div className="spacer" />
        <span className="who">{account.displayName}</span>
        <button className="ghost" onClick={onLogout}>
          Salir
        </button>
      </header>
      <main className="worlds">
        <h2>Mundos</h2>
        <p className="muted">
          Cada mundo es una temporada independiente: nada se transfiere entre mundos.
        </p>
        {!worlds && <p>Cargando mundos…</p>}
        <div className="world-grid">
          {worlds?.map((w) => (
            <article key={w.id} className="card world">
              <header>
                <h3>{w.name}</h3>
                <span className="badge">
                  {w.status === 'PLANNED'
                    ? 'Próximo'
                    : w.status === 'PAUSED'
                      ? 'Pausado'
                      : 'En curso'}
                </span>
              </header>
              <dl>
                <dt>Estado</dt>
                <dd>{w.status === 'OPEN' ? 'Abierto' : w.status}</dd>
                <dt>Velocidad</dt>
                <dd>×{w.speedMultiplier}</dd>
                <dt>Jugadores</dt>
                <dd>{w.playerCount}</dd>
                <dt>Mapa</dt>
                <dd>
                  {w.mapSize}×{w.mapSize}
                </dd>
                {w.status === 'PLANNED' && (
                  <>
                    <dt>Apertura</dt>
                    <dd>
                      {w.opensAt ? new Date(w.opensAt).toLocaleString('es-CL') : 'Por anunciar'}
                    </dd>
                  </>
                )}
              </dl>
              {w.membership ? (
                <button
                  className="primary"
                  onClick={() => onEnter(w.id, w.membership!.villageIds[0]!)}
                >
                  Entrar a mi ciudad
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={w.status !== 'OPEN'}
                  onClick={() => setJoining(w.id)}
                >
                  Unirse
                </button>
              )}
            </article>
          ))}
        </div>
      </main>
      {worlds?.find((w) => w.id === joining) && (
        <JoinWorldDialog
          world={worlds.find((w) => w.id === joining)!}
          onCancel={() => setJoining(null)}
          onJoined={(villageId) => onEnter(joining!, villageId)}
        />
      )}
    </div>
  );
}
