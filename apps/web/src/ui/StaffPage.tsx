import { useEffect, useState } from 'react';
import type {
  AccountView,
  AccountRole,
  StaffOverview,
  ModerationWorld,
  ManagedWorld,
} from '@reinos/contracts';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import './staff.css';

const date = (s: string | null) => (s ? new Date(s).toLocaleString('es-CL') : 'Sin fecha');
const stateNames: Record<string, string> = {
  DRAFT: 'Borrador',
  PLANNED: 'Próximo',
  OPEN: 'En curso',
  WONDER_ERA: 'Era monumental',
  PAUSED: 'Pausado',
  FINALIZING: 'Cerrando',
  FINISHED: 'Finalizado',
  ARCHIVED: 'Archivado',
  CANCELLED: 'Cancelado',
};
const roleNames: Record<AccountRole, string> = {
  ADMIN: 'Administrador',
  MODERATOR: 'Moderador',
  PLAYER: 'Jugador',
};
export function StaffPage({ account, onLogout }: { account: AccountView; onLogout: () => void }) {
  const [data, setData] = useState<StaffOverview | null>(null),
    [tab, setTab] = useState<'worlds' | 'users' | 'audit'>('worlds'),
    [detail, setDetail] = useState<ModerationWorld | null>(null),
    [create, setCreate] = useState(false),
    [editing, setEditing] = useState<ManagedWorld | null>(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('');
  const toast = useToast(),
    admin = account.role === 'ADMIN';
  const refresh = () => api.management().then(setData);
  useEffect(() => {
    void api
      .management()
      .then(setData)
      .catch((e) => toast('error', describeError(e)));
  }, [toast]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (detail) setDetail(await api.managedWorld(detail.id));
      toast('info', 'Cambios guardados');
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async (w: ManagedWorld) => {
    try {
      setDetail(await api.managedWorld(w.id));
    } catch (e) {
      toast('error', describeError(e));
    }
  };
  return (
    <div className="staff-app">
      <header className="staff-header">
        <a href="#/">Reinos de la Frontera</a>
        <span>Gestión de la aplicación</span>
        <div className="spacer" />
        <span>
          {account.displayName} · {roleNames[account.role]}
        </span>
        <button onClick={onLogout}>Salir</button>
      </header>
      <div className="staff-shell">
        <nav className="staff-nav" aria-label="Gestión">
          <p className="muted">{admin ? 'Administración global' : 'Moderación'}</p>
          <button
            className={tab === 'worlds' ? 'active' : ''}
            onClick={() => {
              setTab('worlds');
              setDetail(null);
            }}
          >
            Mundos {data && `(${data.worlds.length})`}
          </button>
          {admin && (
            <button
              className={tab === 'users' ? 'active' : ''}
              onClick={() => {
                setTab('users');
                setDetail(null);
              }}
            >
              Usuarios y perfiles
            </button>
          )}
          <button
            className={tab === 'audit' ? 'active' : ''}
            onClick={() => {
              setTab('audit');
              setDetail(null);
            }}
          >
            Auditoría
          </button>
          <p className="muted">
            {admin
              ? 'Crea y publica las temporadas que verán los jugadores.'
              : 'Solo tienes acceso a tus mundos asignados.'}
          </p>
        </nav>
        <main className="staff-main" aria-busy={busy}>
          {!data ? (
            <p>Cargando gestión…</p>
          ) : (
            <>
              <div className="staff-metrics">
                {[
                  ['Mundos', data.stats.worlds],
                  ['Jugadores', data.stats.players],
                  ['Aldeas', data.stats.villages],
                  ['Combates', data.stats.battles],
                  ['Marchas', data.stats.movements],
                  ['Denuncias abiertas', data.stats.complaints],
                ].map(([label, n]) => (
                  <div className="card" key={label}>
                    <small>{label}</small>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
              {detail ? (
                <>
                  <button onClick={() => setDetail(null)}>← Todos los mundos</button>
                  <WorldManagement detail={detail} admin={admin} busy={busy} run={run} />
                </>
              ) : tab === 'worlds' ? (
                <>
                  <div className="staff-title">
                    <div>
                      <h1>{admin ? 'Mundos y temporadas' : 'Mundos asignados'}</h1>
                      <p className="muted">
                        Calendario, participantes, alianzas, anuncios y moderación.
                      </p>
                    </div>
                    {admin && (
                      <button
                        className="primary"
                        onClick={() => {
                          setEditing(null);
                          setCreate(!create);
                        }}
                      >
                        {create ? 'Cerrar formulario' : 'Crear mundo'}
                      </button>
                    )}
                  </div>
                  {create && admin && (
                    <WorldForm
                      busy={busy}
                      onSubmit={(b) =>
                        run(async () => {
                          await api.createWorld(b);
                          setCreate(false);
                        })
                      }
                    />
                  )}
                  {editing && admin && (
                    <>
                      <button onClick={() => setEditing(null)}>Cerrar edición</button>
                      <WorldForm
                        key={editing.id}
                        initial={editing}
                        busy={busy}
                        onSubmit={(body) =>
                          run(async () => {
                            await api.updateWorld(editing.id, body);
                            setEditing(null);
                          })
                        }
                      />
                    </>
                  )}
                  <div className="world-grid">
                    {data.worlds.map((w) => (
                      <article className="card managed-world" key={w.id}>
                        <header>
                          <h2>{w.name}</h2>
                          <span className="badge">{stateNames[w.status]}</span>
                        </header>
                        <p>{w.description}</p>
                        <dl>
                          <dt>Apertura</dt>
                          <dd>{date(w.opensAt)}</dd>
                          <dt>Cierre</dt>
                          <dd>{date(w.endsAt)}</dd>
                          <dt>Mapa</dt>
                          <dd>
                            {w.mapSize} × {w.mapSize}
                          </dd>
                          <dt>Velocidades</dt>
                          <dd>
                            Economía ×{w.speedMultiplier} · Militar ×{w.movementSpeedMultiplier}
                          </dd>
                          <dt>Participantes</dt>
                          <dd>
                            {w.players} jugadores · {w.villages} aldeas
                          </dd>
                        </dl>
                        <button onClick={() => void open(w)}>Gestionar mundo</button>
                        {admin && w.status === 'DRAFT' && (
                          <button
                            onClick={() => {
                              setCreate(false);
                              setEditing(w);
                            }}
                          >
                            Editar borrador
                          </button>
                        )}
                        {admin && (
                          <>
                            <div className="staff-actions">
                              {(w.status === 'DRAFT'
                                ? ['PUBLISH', 'CANCEL']
                                : w.status === 'PLANNED'
                                  ? ['CANCEL']
                                  : w.status === 'PAUSED'
                                    ? ['RESUME']
                                    : ['OPEN', 'WONDER_ERA'].includes(w.status)
                                      ? ['PAUSE', 'FINISH']
                                      : w.status === 'FINISHED'
                                        ? ['ARCHIVE']
                                        : []
                              ).map((action) => (
                                <button
                                  disabled={busy}
                                  key={action}
                                  onClick={() => void run(() => api.worldAction(w.id, action))}
                                >
                                  {
                                    (
                                      {
                                        PUBLISH: 'Publicar',
                                        CANCEL: 'Cancelar',
                                        PAUSE: 'Pausar',
                                        RESUME: 'Reanudar',
                                        FINISH: 'Cerrar temporada',
                                        ARCHIVE: 'Archivar',
                                      } as Record<string, string>
                                    )[action]
                                  }
                                </button>
                              ))}
                            </div>
                            <details>
                              <summary>Moderadores ({w.moderators.length})</summary>
                              {data.users
                                .filter((u) => u.role === 'MODERATOR' && u.status === 'ACTIVE')
                                .map((u) => (
                                  <label className="staff-check" key={u.id}>
                                    <input
                                      type="checkbox"
                                      disabled={busy}
                                      checked={w.moderators.some((m) => m.id === u.id)}
                                      onChange={(e) =>
                                        void run(() =>
                                          api.assignModerator(w.id, u.id, e.target.checked),
                                        )
                                      }
                                    />
                                    {u.displayName}
                                  </label>
                                ))}
                            </details>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  {data.worlds.length === 0 && <p>No tienes mundos asignados.</p>}
                </>
              ) : tab === 'users' && admin ? (
                <>
                  <h1>Usuarios y perfiles</h1>
                  <CreateUser busy={busy} submit={(b) => run(() => api.createUser(b))} />
                  <label>
                    Buscar por nombre o correo
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} />
                  </label>
                  <div className="staff-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Perfil</th>
                          <th>Estado</th>
                          <th>Mundos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.users
                          .filter((u) =>
                            `${u.displayName} ${u.email}`
                              .toLowerCase()
                              .includes(filter.toLowerCase()),
                          )
                          .map((u) => (
                            <tr key={u.id}>
                              <td>
                                <strong>{u.displayName}</strong>
                                <small>{u.email}</small>
                              </td>
                              <td>
                                <select
                                  aria-label={`Perfil de ${u.displayName}`}
                                  value={u.role}
                                  disabled={busy || u.id === account.id}
                                  onChange={(e) =>
                                    void run(() => api.updateUser(u.id, { role: e.target.value }))
                                  }
                                >
                                  {Object.entries(roleNames).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <button
                                  disabled={busy || u.id === account.id}
                                  onClick={() =>
                                    void run(() =>
                                      api.updateUser(u.id, {
                                        status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                                      }),
                                    )
                                  }
                                >
                                  {u.status === 'ACTIVE'
                                    ? 'Activo · Desactivar'
                                    : 'Desactivado · Activar'}
                                </button>
                              </td>
                              <td>{u.worlds.length}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  <h1>Auditoría administrativa</h1>
                  <p className="muted">Últimas 100 operaciones, con autor, mundo y fecha.</p>
                  <div className="staff-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Autor</th>
                          <th>Acción</th>
                          <th>Mundo / detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.audit.map((a) => (
                          <tr key={a.id}>
                            <td>{date(a.createdAt)}</td>
                            <td>{a.actorName}</td>
                            <td>{a.action}</td>
                            <td>
                              {data.worlds.find((w) => w.id === a.worldId)?.name ?? 'Global'}
                              <details>
                                <summary>Detalle</summary>
                                <pre>{JSON.stringify(a.details, null, 2)}</pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function WorldForm({
  busy,
  onSubmit,
  initial,
}: {
  busy: boolean;
  onSubmit: (b: unknown) => Promise<void>;
  initial?: ManagedWorld;
}) {
  const localInput = (value: string | null | undefined) => {
    if (!value) return '';
    const d = new Date(value);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const [name, setName] = useState(initial?.name ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [size, setSize] = useState(initial?.mapSize ?? 1000),
    [speed, setSpeed] = useState(initial?.speedMultiplier ?? 1),
    [military, setMilitary] = useState(initial?.movementSpeedMultiplier ?? 1),
    [rules, setRules] = useState(initial?.rulesetVersion ?? 'frontier-alpha.4'),
    [seed, setSeed] = useState(
      () => initial?.mapSeed ?? (crypto.getRandomValues(new Uint32Array(1))[0]! % 2147483646) + 1,
    ),
    [protection, setProtection] = useState(initial?.protectionHours ?? 72),
    [opens, setOpens] = useState(localInput(initial?.opensAt)),
    [ends, setEnds] = useState(localInput(initial?.endsAt));
  return (
    <form
      className="card staff-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          name,
          description,
          rulesetVersion: rules,
          mapSize: size,
          speedMultiplier: speed,
          movementSpeedMultiplier: military,
          mapSeed: seed,
          protectionHours: protection,
          opensAt: new Date(opens).toISOString(),
          endsAt: ends ? new Date(ends).toISOString() : null,
        });
      }}
    >
      <h2>{initial ? 'Editar borrador' : 'Nuevo mundo'}</h2>
      <div className="staff-fields">
        <label>
          Reglas de la temporada
          <select value={rules} onChange={(e) => setRules(e.target.value)}>
            <option value="frontier-alpha.4">Cultura, expansión, producción y oasis</option>
            <option value="frontier-alpha.3">Producción y oasis</option>
          </select>
        </label>
        <label>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={3}
            maxLength={60}
            required
          />
        </label>
        <label>
          Tamaño
          <select value={size} onChange={(e) => setSize(+e.target.value)}>
            {[1000, 2000, 5000].map((s) => (
              <option key={s} value={s}>
                {s} × {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Velocidad económica
          <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
            {[1, 2, 3, 4, 5].map((s) => (
              <option key={s}> {s}</option>
            ))}
          </select>
        </label>
        <label>
          Velocidad militar
          <select value={military} onChange={(e) => setMilitary(+e.target.value)}>
            {[1, 2, 3, 4, 5].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Inicio
          <input
            type="datetime-local"
            value={opens}
            required
            onChange={(e) => setOpens(e.target.value)}
          />
        </label>
        <label>
          Fin opcional
          <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
        <label>
          Protección inicial (horas)
          <input
            type="number"
            min={0}
            max={720}
            value={protection}
            onChange={(e) => setProtection(+e.target.value)}
          />
        </label>
        <label>
          Semilla del mapa
          <input
            type="number"
            min={1}
            max={2147483647}
            value={seed}
            onChange={(e) => setSeed(+e.target.value)}
          />
        </label>
      </div>
      <label>
        Descripción
        <textarea
          value={description}
          maxLength={1500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <p className="muted">
        Se crea como borrador. Publícalo para que aparezca en el listado de jugadores; abrirá en la
        fecha configurada.
      </p>
      <button className="primary" disabled={busy}>
        Guardar borrador
      </button>
    </form>
  );
}
function CreateUser({
  busy,
  submit,
}: {
  busy: boolean;
  submit: (b: {
    email: string;
    password: string;
    displayName: string;
    role: AccountRole;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [role, setRole] = useState<AccountRole>('MODERATOR');
  return (
    <details className="card">
      <summary>Crear usuario o Moderador</summary>
      <form
        className="staff-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ email, password, displayName: name, role }).then(() => setPassword(''));
        }}
      >
        <div className="staff-fields">
          <label>
            Nombre
            <input
              value={name}
              minLength={3}
              maxLength={24}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Correo
            <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Contraseña inicial
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={10}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Perfil
            <select value={role} onChange={(e) => setRole(e.target.value as AccountRole)}>
              {Object.entries(roleNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary" disabled={busy}>
          Crear usuario
        </button>
      </form>
    </details>
  );
}
function WorldManagement({
  detail: d,
  admin,
  busy,
  run,
}: {
  detail: ModerationWorld;
  admin: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [section, setSection] = useState('players'),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [reason, setReason] = useState(''),
    [target, setTarget] = useState(''),
    [kind, setKind] = useState('WARNING'),
    [hours, setHours] = useState(24),
    [note, setNote] = useState('');
  return (
    <>
      <h1>{d.name}</h1>
      <div className="tabs">
        {[
          ['players', 'Jugadores'],
          ['alliances', 'Alianzas'],
          ['complaints', 'Denuncias'],
          ['announcements', 'Anuncios'],
          ['sanctions', 'Sanciones'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={section === key ? 'active' : ''}
            onClick={() => setSection(key!)}
          >
            {label}
          </button>
        ))}
      </div>
      {section === 'players' ? (
        <div className="staff-table">
          <table>
            <thead>
              <tr>
                <th>Personaje</th>
                <th>Pueblo</th>
                <th>Aldeas</th>
              </tr>
            </thead>
            <tbody>
              {d.players.map((p) => (
                <tr key={p.accountId}>
                  <td>{p.name}</td>
                  <td>
                    {(
                      {
                        stone_wardens: 'Romanos',
                        forest_kin: 'Galos',
                        steppe_clans: 'Germanos',
                      } as Record<string, string>
                    )[p.civilization] ?? p.civilization}
                  </td>
                  <td>{p.villages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : section === 'alliances' ? (
        <div className="world-grid">
          {d.alliances.map((a) => (
            <article key={a.id} className="card">
              <h2>{a.name}</h2>
              <p>{a.members} miembros</p>
            </article>
          ))}
        </div>
      ) : section === 'announcements' ? (
        <>
          <form
            className="card staff-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.announce(d.id, { title, body }));
            }}
          >
            <h2>Publicar anuncio</h2>
            <label>
              Título
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={3}
                maxLength={100}
                required
              />
            </label>
            <label>
              Mensaje
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                minLength={3}
                maxLength={4000}
                required
              />
            </label>
            <button disabled={busy}>Publicar</button>
          </form>
          {d.announcements.map((a) => (
            <article className="card" key={a.id}>
              <h3>{a.title}</h3>
              <small>{date(a.createdAt)}</small>
              <p>{a.body}</p>
            </article>
          ))}
        </>
      ) : section === 'complaints' ? (
        <>
          <label>
            Nota de revisión
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={3}
              maxLength={2000}
            />
          </label>
          {d.complaints.map((c) => (
            <article className="card" key={c.id}>
              <h3>
                {c.category} · {c.status}
              </h3>
              <small>{date(c.createdAt)}</small>
              <p>{c.description}</p>
              <div className="staff-actions">
                {[
                  ['REVIEWING', 'En revisión'],
                  ['RESOLVED', 'Resolver'],
                  ['ESCALATED', 'Escalar al administrador'],
                ].map(([status, label]) => (
                  <button
                    disabled={busy || note.trim().length < 3}
                    key={status}
                    onClick={() =>
                      void run(() => api.reviewComplaint(d.id, c.id, { status, note }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </>
      ) : (
        <>
          <form
            className="card staff-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.sanction(d.id, { accountId: target, kind, reason, hours }));
            }}
          >
            <h2>{admin ? 'Sanción en el mundo' : 'Advertencia o suspensión temporal'}</h2>
            <div className="staff-fields">
              <label>
                Jugador
                <select value={target} required onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Seleccionar</option>
                  {d.players.map((p) => (
                    <option key={p.accountId} value={p.accountId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="WARNING">Advertencia</option>
                  <option value="SUSPENSION">Suspensión</option>
                </select>
              </label>
              <label>
                Duración (horas)
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={hours}
                  onChange={(e) => setHours(+e.target.value)}
                />
              </label>
            </div>
            <label>
              Motivo
              <textarea
                value={reason}
                minLength={5}
                maxLength={2000}
                required
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button disabled={busy}>Registrar sanción</button>
          </form>
          {d.sanctions.map((s) => (
            <article className="card" key={s.id}>
              <strong>
                {d.players.find((p) => p.accountId === s.accountId)?.name} · {s.kind}
              </strong>
              <p>{s.reason}</p>
              <small>Hasta {date(s.expiresAt)}</small>
            </article>
          ))}
        </>
      )}
    </>
  );
}
