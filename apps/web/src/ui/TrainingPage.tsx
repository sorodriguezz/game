import { useEffect, useState } from 'react';
import type { AccountView, BattleConfigView, TrainingMatchView } from '@reinos/contracts';
import {
  DEFAULT_TACTICAL_RULESET_VERSION,
  getRuleset,
  getTacticalRuleset,
  type CivilizationId,
} from '@reinos/game-config';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { localTime } from '../format.js';

const tactical = getTacticalRuleset(DEFAULT_TACTICAL_RULESET_VERSION);
const ruleset = getRuleset(tactical.baseRulesetVersion);
type ArmyId = 'balanced' | 'cavalry_raid' | 'archer_line' | 'large';

function ArmyPicker({
  value,
  onChange,
  label,
}: {
  value: ArmyId;
  onChange: (v: ArmyId) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as ArmyId)}>
        {tactical.trainingArmies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CivPicker({
  value,
  onChange,
  label,
}: {
  value: CivilizationId;
  onChange: (v: CivilizationId) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as CivilizationId)}>
        {ruleset.civilizations.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Lobby de ENTRENAMIENTO táctico (Gate 1, ADR-0037): ejércitos sintetizados
 * del catálogo. Nada de lo que ocurra aquí afecta a ningún mundo.
 */
export function TrainingPage({
  account,
  onOpen,
  onBack,
}: {
  account: AccountView;
  onOpen: (matchId: string) => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const [cfg, setCfg] = useState<BattleConfigView | null>(null);
  const [mine, setMine] = useState<TrainingMatchView[]>([]);
  const [civ, setCiv] = useState<CivilizationId>('imperial_crown');
  const [army, setArmy] = useState<ArmyId>('balanced');
  const [oppCiv, setOppCiv] = useState<CivilizationId>('sea_league');
  const [oppArmy, setOppArmy] = useState<ArmyId>('balanced');
  const [code, setCode] = useState('');
  const [waiting, setWaiting] = useState<TrainingMatchView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .battleConfig()
      .then(setCfg)
      .catch(() => setCfg(null));
    api
      .trainings()
      .then(setMine)
      .catch(() => {});
  }, []);

  // Anfitrión PvP: espera a que el invitado se una (sondeo cada 2 s).
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      const m = await api.training(waiting.id).catch(() => null);
      if (m?.status === 'LIVE') onOpen(m.id);
      else if (m && m.status !== 'WAITING_OPPONENT') {
        setWaiting(null);
        toast('error', 'La invitación terminó sin rival.');
      }
    }, 2000);
    return () => clearInterval(t);
  }, [waiting, onOpen, toast]);

  const run = async (fn: () => Promise<TrainingMatchView>) => {
    setBusy(true);
    try {
      const m = await fn();
      if (m.status === 'LIVE') onOpen(m.id);
      else setWaiting(m);
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const available = cfg?.trainingEnabled && cfg.battleServerHealthy;
  return (
    <div className="page">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ← Mundos
        </button>
        <div className="brand">Campo de entrenamiento táctico</div>
        <div className="spacer" />
        <span className="who">{account.displayName}</span>
      </header>
      <main className="worlds">
        <p className="muted">
          Batallas RTS por formaciones contra la doctrina (IA de reglas) o contra otro jugador.{' '}
          <strong>No consumen tropas, recursos ni dan puntos:</strong> sirven para aprender y para
          validar el modo táctico antes de habilitarlo en los mundos (MVP 2, Gate 1).
        </p>
        {cfg && !available && (
          <p className="warn">
            {cfg.trainingEnabled
              ? 'El servidor táctico no responde ahora mismo.'
              : 'El entrenamiento táctico está desactivado en este servidor.'}
          </p>
        )}
        <div className="world-grid">
          <article className="card">
            <h3>Contra la doctrina</h3>
            <CivPicker label="Tu civilización" value={civ} onChange={setCiv} />
            <ArmyPicker label="Tu ejército" value={army} onChange={setArmy} />
            <CivPicker label="Civilización rival" value={oppCiv} onChange={setOppCiv} />
            <ArmyPicker label="Ejército rival" value={oppArmy} onChange={setOppArmy} />
            <button
              className="primary"
              disabled={busy || !available}
              onClick={() =>
                run(() =>
                  api.createTraining({
                    opponent: 'DOCTRINE',
                    civilization: civ,
                    army,
                    opponentCivilization: oppCiv,
                    opponentArmy: oppArmy,
                  }),
                )
              }
            >
              Empezar batalla
            </button>
          </article>
          <article className="card">
            <h3>Duelo con otro jugador</h3>
            {waiting ? (
              <>
                <p>Comparte este código con tu rival:</p>
                <p className="invite-code" aria-live="polite">
                  {waiting.inviteCode}
                </p>
                <p className="muted small">
                  Caduca {localTime(waiting.expiresAt)}. La batalla empieza cuando se une.
                </p>
                <button className="ghost" onClick={() => setWaiting(null)}>
                  Cancelar espera
                </button>
              </>
            ) : (
              <>
                <CivPicker label="Tu civilización" value={civ} onChange={setCiv} />
                <ArmyPicker label="Tu ejército" value={army} onChange={setArmy} />
                <button
                  className="primary"
                  disabled={busy || !available}
                  onClick={() =>
                    run(() => api.createTraining({ opponent: 'PLAYER', civilization: civ, army }))
                  }
                >
                  Crear invitación
                </button>
                <hr />
                <label>
                  Código de invitación
                  <input
                    value={code}
                    maxLength={6}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    aria-label="Código de invitación"
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || !available || code.length !== 6}
                  onClick={() => run(() => api.joinTraining(code, { civilization: civ, army }))}
                >
                  Unirse al duelo
                </button>
              </>
            )}
          </article>
          <article className="card">
            <h3>Mis entrenamientos</h3>
            {mine.length === 0 && <p className="muted">Aún no has entrenado.</p>}
            <ul className="list">
              {mine.map((m) => (
                <li key={m.id}>
                  <button
                    className="link"
                    disabled={m.status !== 'LIVE'}
                    onClick={() => onOpen(m.id)}
                  >
                    {m.opponent === 'DOCTRINE'
                      ? 'vs doctrina'
                      : `vs ${m.mySide === 'ATTACKER' ? (m.guestName ?? '—') : m.hostName}`}
                  </button>
                  <span className="muted small">
                    {m.status === 'FINISHED' && m.result
                      ? m.result.winner === 'DRAW'
                        ? 'Empate'
                        : m.result.winner === m.mySide
                          ? 'Victoria'
                          : 'Derrota'
                      : m.status}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </main>
    </div>
  );
}
