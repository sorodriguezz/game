import { useEffect, useRef, useState } from 'react';
import type { WorldSummary } from '@reinos/contracts';
import { getRuleset, type CivilizationId } from '@reinos/game-config';
import { coordinateBounds } from '@reinos/game-rules';
import { api, describeError } from '../api.js';
import './join.css';
const quadrants = [
  { id: 'NW', name: 'Noroeste', sign: '− | +', description: 'X negativo · Y positivo' },
  { id: 'NE', name: 'Noreste', sign: '+ | +', description: 'X positivo · Y positivo' },
  { id: 'SW', name: 'Suroeste', sign: '− | −', description: 'X negativo · Y negativo' },
  { id: 'SE', name: 'Sureste', sign: '+ | −', description: 'X positivo · Y negativo' },
] as const;
export function JoinWorldDialog({
  world,
  onCancel,
  onJoined,
}: {
  world: WorldSummary;
  onCancel: () => void;
  onJoined: (id: string) => void;
}) {
  const r = getRuleset(world.rulesetVersion),
    dialog = useRef<HTMLDialogElement>(null),
    [step, setStep] = useState(1),
    [civ, setCiv] = useState<CivilizationId>(r.civilizations[0]!.id),
    [quadrant, setQuadrant] = useState<'NW' | 'NE' | 'SW' | 'SE'>('NW'),
    [character, setCharacter] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const joined = await api.join(world.id, {
        civilization: civ,
        villageName: name,
        ...(r.fortifications ? { quadrant, characterName: character } : {}),
      });
      onJoined(joined.villageId);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className={`join-dialog ${step === 2 ? 'join-location' : ''}`}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onCancel();
      }}
      aria-labelledby="join-title"
    >
      <form onSubmit={(e) => void submit(e)}>
        <header>
          <div>
            <small>{world.name}</small>
            <h1 id="join-title">Funda tu primera aldea</h1>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Cerrar registro en el mundo"
          >
            ✕
          </button>
        </header>
        <ol className="join-steps" aria-label="Pasos del registro">
          {['Pueblo', 'Ubicación', 'Tu identidad'].map((label, i) => (
            <li
              className={step === i + 1 ? 'active' : step > i + 1 ? 'complete' : ''}
              key={label}
              aria-current={step === i + 1 ? 'step' : undefined}
            >
              <span>{step > i + 1 ? '✓' : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {step === 1 ? (
          <section>
            <h2>Elige tu pueblo</h2>
            <p className="muted">Será tu civilización durante esta temporada.</p>
            <div className="join-civilizations">
              {r.civilizations.map((c) => (
                <label key={c.id} className={civ === c.id ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="civilization"
                    value={c.id}
                    checked={civ === c.id}
                    onChange={() => setCiv(c.id)}
                  />
                  <span className="tribe-emblem" aria-hidden>
                    {c.id === 'stone_wardens' ? '♜' : c.id === 'forest_kin' ? '♧' : '⚒'}
                  </span>
                  <h3>{c.name}</h3>
                  <p>{c.tagline}</p>
                  <small>
                    {c.id === 'stone_wardens'
                      ? 'Muros de piedra · Construcción paralela'
                      : c.id === 'forest_kin'
                        ? 'Muros de madera · Defensa y movilidad'
                        : 'Muros de arcilla · Incursiones'}
                  </small>
                </label>
              ))}
            </div>
          </section>
        ) : step === 2 ? (
          <section className="join-map-step">
            <h2>Elige tu cuadrante</h2>
            <p className="muted">
              El centro del mundo es 0|0. Tu aldea aparecerá en una casilla libre del cuadrante
              seleccionado.
            </p>
            <QuadrantMap world={world} selected={quadrant} onSelect={setQuadrant} />
          </section>
        ) : (
          <section className="join-identity">
            <h2>Dale nombre a tu reino</h2>
            <label>
              Nombre del personaje en este mundo
              <input
                value={character}
                minLength={3}
                maxLength={24}
                pattern="[\p{L}\p{N}_ .\-]+"
                onChange={(e) => setCharacter(e.target.value)}
                required={!!r.fortifications}
                autoComplete="nickname"
              />
            </label>
            <label>
              Nombre de tu aldea
              <input
                value={name}
                minLength={3}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <div className="join-confirm">
              <strong>{r.civilizations.find((c) => c.id === civ)?.name}</strong>
              <span>
                {quadrants.find((q) => q.id === quadrant)?.name} (
                {quadrants.find((q) => q.id === quadrant)?.sign})
              </span>
              <p>Comienzas con el Centro Urbano y los campos en nivel 0.</p>
            </div>
          </section>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            disabled={busy}
            onClick={() => (step > 1 ? setStep((s) => s - 1) : onCancel())}
          >
            {step > 1 ? 'Atrás' : 'Cancelar'}
          </button>
          <span>Paso {step} de 3</span>
          <button className="primary" disabled={busy}>
            {busy ? 'Fundando…' : step === 3 ? 'Fundar aldea' : 'Siguiente →'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
function QuadrantMap({
  world,
  selected,
  onSelect,
}: {
  world: WorldSummary;
  selected: 'NW' | 'NE' | 'SW' | 'SE';
  onSelect: (q: 'NW' | 'NE' | 'SW' | 'SE') => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    bounds = coordinateBounds(world.mapSize);
  useEffect(() => {
    let live = true;
    void api
      .worldOverview(world.id)
      .then((d) => {
        if (!live) return;
        const c = canvas.current,
          ctx = c?.getContext('2d');
        if (!c || !ctx) return;
        c.width = d.resolution;
        c.height = d.resolution;
        const colors: Record<string, string> = {
          P: '#92ae65',
          F: '#426d3c',
          M: '#8a9074',
          O: '#bad179',
          S: '#679caf',
        };
        for (let y = 0; y < d.resolution; y++)
          for (let x = 0; x < d.resolution; x++) {
            ctx.fillStyle = colors[d.tiles[y * d.resolution + x]!] ?? '#92ae65';
            ctx.fillRect(x, y, 1, 1);
          }
        setLoading(false);
      })
      .catch((e) => {
        if (live) {
          setError(describeError(e));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [world.id]);
  return (
    <div className="quadrant-layout">
      <div className="quadrant-map" role="group" aria-label="Mapa completo y cuadrantes">
        <canvas ref={canvas} aria-label={`Mapa completo ${world.mapSize} por ${world.mapSize}`} />
        {loading && <span className="map-loading">Cargando mundo…</span>}
        {error && <span role="alert">{error}</span>}
        <div className="quadrant-grid">
          {quadrants.map((q) => (
            <button
              key={q.id}
              type="button"
              className={selected === q.id ? 'selected' : ''}
              aria-pressed={selected === q.id}
              onClick={() => onSelect(q.id)}
            >
              <strong>{q.name}</strong>
              <span>{q.sign}</span>
              <small>{selected === q.id ? '✓ Seleccionado' : q.description}</small>
            </button>
          ))}
        </div>
        <span className="map-origin">0 | 0</span>
        <span className="map-axis north">N · Y +</span>
        <span className="map-axis east">X + · E</span>
        <span className="map-axis south">S · Y −</span>
        <span className="map-axis west">O · X −</span>
      </div>
      <aside>
        <h3>{quadrants.find((q) => q.id === selected)?.name}</h3>
        <strong>{quadrants.find((q) => q.id === selected)?.sign}</strong>
        <p>{quadrants.find((q) => q.id === selected)?.description}</p>
        <p>
          Mundo {world.mapSize} × {world.mapSize}
        </p>
        <p>
          Coordenadas: {bounds.min} a {bounds.max}
        </p>
        <small>
          La casilla de fundación se asigna al confirmar. Bosques, montañas y oasis quedan
          reservados al terreno.
        </small>
      </aside>
    </div>
  );
}
