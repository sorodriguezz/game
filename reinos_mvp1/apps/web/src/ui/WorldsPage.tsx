import { useEffect, useState } from 'react';
import type { AccountView, WorldSummary } from '@reinos/contracts';
import { getRuleset, type CivilizationId } from '@reinos/game-config';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';

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
                <span className={`badge badge-${w.profile}`}>
                  {w.profile === 'test' ? 'prueba' : w.profile}
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
              </dl>
              {w.membership ? (
                <button
                  className="primary"
                  onClick={() => onEnter(w.id, w.membership!.villageIds[0]!)}
                >
                  Entrar a mi ciudad
                </button>
              ) : joining === w.id ? (
                <JoinForm
                  world={w}
                  onCancel={() => setJoining(null)}
                  onJoined={(villageId) => onEnter(w.id, villageId)}
                />
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
    </div>
  );
}

function JoinForm({
  world,
  onCancel,
  onJoined,
}: {
  world: WorldSummary;
  onCancel: () => void;
  onJoined: (villageId: string) => void;
}) {
  const r = getRuleset(world.rulesetVersion);
  const [civ, setCiv] = useState<CivilizationId>('imperial_crown');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.join(world.id, { civilization: civ, villageName: name });
      onJoined(res.villageId);
    } catch (err) {
      toast('error', describeError(err));
      setBusy(false);
    }
  };
  return (
    <form className="join" onSubmit={submit}>
      <fieldset>
        <legend>Civilización (no se puede cambiar después)</legend>
        {r.civilizations.map((c) => (
          <label key={c.id} className={`civ ${civ === c.id ? 'selected' : ''}`}>
            <input
              type="radio"
              name="civ"
              value={c.id}
              checked={civ === c.id}
              onChange={() => setCiv(c.id)}
            />
            <strong>{c.name}</strong>
            <span>{c.tagline}</span>
            <small>
              Único: {r.buildings.find((b) => b.type === c.uniqueBuilding)?.name} ·{' '}
              {r.units.find((u) => u.type === c.uniqueUnit)?.name}
            </small>
          </label>
        ))}
      </fieldset>
      <label>
        Nombre de tu ciudad
        <input
          value={name}
          minLength={3}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <div className="row">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          {busy ? 'Fundando…' : 'Fundar ciudad'}
        </button>
      </div>
    </form>
  );
}
