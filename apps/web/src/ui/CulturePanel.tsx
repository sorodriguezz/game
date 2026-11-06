import { useState } from 'react';
import type { VillageView } from '@reinos/contracts';
import { getRuleset } from '@reinos/game-config';
import { api, describeError } from '../api.js';
import { useToast } from '../App.js';
import { fmt, duration } from '../format.js';
export function CulturePanel({
  view,
  now,
  celebrate,
  onChanged,
}: {
  view: VillageView;
  now: number;
  celebrate: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    toast = useToast(),
    c = view.culture,
    config = getRuleset(view.rulesetVersion).culture;
  if (!c || !config) return null;
  const start = async () => {
    setBusy(true);
    try {
      await api.celebrate(view.worldId, view.id);
      onChanged();
      toast('info', 'Celebración iniciada');
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="culture-panel" aria-label="Cultura y expansión">
      <h3>Cultura y expansión</h3>
      <p>
        <strong>{fmt(c.pointsMilli / 1000)}</strong> / {fmt(c.requiredMilli / 1000)} puntos para
        otra aldea · +{fmt(c.perDay)}/día
      </p>
      <progress value={Math.min(c.pointsMilli, c.requiredMilli)} max={c.requiredMilli} />
      <p>
        {c.ownedVillages} aldeas · {c.pendingVillages} expansiones en camino
      </p>
      <p>
        Castillo: {c.usedSlots} cupos utilizados, {c.pendingSlots} reservados y{' '}
        {Math.max(0, c.slots - c.usedSlots - c.pendingSlots)} libres de {c.slots}.
      </p>
      <small>
        El Castillo habilita cupos a nivel {config.castleLevels.join(', ')}. La cultura es de tu
        personaje en este mundo.
      </small>
      {celebrate && (
        <>
          <h4>Celebración</h4>
          {c.celebration ? (
            <p role="status">
              +{fmt(c.celebration.points)} puntos al finalizar ·{' '}
              {duration(Math.max(0, (Date.parse(c.celebration.completesAt) - now) / 1000))}
            </p>
          ) : (
            <>
              <p>
                +{fmt(config.celebrationPoints)} puntos de cultura en{' '}
                {duration(config.celebrationSeconds / view.speedMultiplier)}.
              </p>
              <p>
                Coste: {fmt(config.celebrationCost.wood)} madera ·{' '}
                {fmt(config.celebrationCost.stone)} barro · {fmt(config.celebrationCost.iron)}{' '}
                hierro · {fmt(config.celebrationCost.food)} cereal
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  Object.entries(config.celebrationCost).some(
                    ([k, v]) =>
                      view.resources.amountsMilli[k as keyof typeof config.celebrationCost] <
                      v * 1000,
                  )
                }
                onClick={() => void start()}
              >
                {busy ? 'Preparando…' : 'Iniciar celebración'}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
