// "Where clicks come from" bars, the devices donut and the top-cities list.
import type { Share } from '../../types';
import { fmtNum } from '../../lib/format';

const pctText = (p: number) => `${Math.round(p)}%`;

export function SourceBars({ items }: { items: Share[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
      {items.map((s) => (
        <li key={s.name} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[14px]">
            <span className="font-semibold">{s.name}</span>
            <span className="font-mono text-text-2">
              {pctText(s.pct)}
              <span className="sr-only"> ({fmtNum(s.count)} clicks)</span>
            </span>
          </div>
          <span aria-hidden className="block h-2 overflow-hidden rounded bg-line-soft">
            <span className="block h-full rounded" style={{ width: `${Math.min(100, s.pct)}%`, background: s.name === 'Other' ? '#52525B' : '#D4FF00' }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const DEVICE_COLORS = ['#D4FF00', '#FFFFFF', '#38BDF8', '#52525B'];
const R = 46;
const C = 2 * Math.PI * R;

/** SVG donut (stroke-dasharray arcs), same geometry as the design. */
export function DevicesDonut({ items, total }: { items: (Share & { device: string })[]; total: number }) {
  let offset = 0;
  const arcs = items.map((d, i) => {
    const len = total ? (d.count / total) * C : 0;
    const arc = { key: d.device, len, offset, color: DEVICE_COLORS[Math.min(i, DEVICE_COLORS.length - 1)] };
    offset += len;
    return arc;
  });
  const label = total ? `Devices: ${items.map((d) => `${d.name} ${pctText(d.pct)}`).join(', ')}` : 'Devices: no clicks yet';
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={label} className="flex-none">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#1E1E24" strokeWidth="16" />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth="16"
            strokeDasharray={`${a.len} ${C}`}
            strokeDashoffset={-a.offset}
            transform="rotate(-90 60 60)"
          />
        ))}
      </svg>
      {total ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[14px]">
          {items.map((d, i) => (
            <li key={d.device} className="flex items-center gap-2.5">
              <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: DEVICE_COLORS[Math.min(i, DEVICE_COLORS.length - 1)] }} />
              {d.name} <strong>{pctText(d.pct)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[14px] text-text-3">No device data yet.</span>
      )}
    </div>
  );
}

export function CityList({ items }: { items: { city: string; count: number; pct: number }[] }) {
  if (!items.length) return <p className="m-0 text-[14.5px] text-text-3">No city data yet for this period.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[14.5px]">
      {items.map((c, i) => (
        <li key={c.city} className="flex justify-between gap-3">
          <span>
            <span className="mr-2.5 font-mono text-text-4">{i + 1}</span>
            {c.city}
          </span>
          <span className="font-mono font-semibold">{pctText(c.pct)}</span>
        </li>
      ))}
    </ol>
  );
}
