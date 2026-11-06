import { useState } from 'react';
import type { MeResponse } from '@reinos/contracts';
import { api, describeError } from '../api.js';

export function AuthPage({ onAuthenticated }: { onAuthenticated: (me: MeResponse) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, displayName, password });
      onAuthenticated(me);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <h1>Reinos de la Frontera</h1>
        <p>
          Funda tu ciudad, forja alianzas y conquista la Maravilla antes de que termine la
          temporada.
        </p>
        <ul>
          <li>Tu economía y tus defensas siguen trabajando aunque cierres el navegador.</li>
          <li>Combates automáticos, deterministas y auditables.</li>
          <li>Sin héroes ni ventajas de pago: gana la estrategia.</li>
        </ul>
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Crear cuenta
          </button>
        </div>
        <label>
          {mode === 'login' ? 'Usuario o correo' : 'Correo'}
          <input
            type={mode === 'login' ? 'text' : 'email'}
            autoComplete={mode === 'login' ? 'username' : 'email'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {mode === 'register' && (
          <label>
            Nombre de gobernante
            <input
              value={displayName}
              minLength={3}
              maxLength={24}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
        )}
        <label>
          Contraseña {mode === 'register' && <small>(mínimo 10 caracteres)</small>}
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
}
