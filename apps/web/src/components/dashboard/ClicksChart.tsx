import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { Timeseries } from '../../types';
import { bucketLabel, fmtNum } from '../../lib/format';

interface Point {
  label: string;
  human: number;
  bots: number;
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-input border border-line bg-surface px-3 py-2 text-[13px] shadow-md">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1 w-3 rounded-sm bg-accent-600" />
        Human <strong className="font-mono">{fmtNum(p.human)}</strong>
      </div>
      <div className="flex items-center gap-2 text-text-3">
        <span aria-hidden className="w-3 border-t-[3px] border-dashed border-text-4" />
        Bots (not counted) <strong className="font-mono">{fmtNum(p.bots)}</strong>
      </div>
    </div>
  );
}

/** Human clicks (solid violet + light area) against bots (dashed grey), in IST buckets. */
export function ClicksChart({ data }: { data: Timeseries }) {
  const points: Point[] = data.points.map((p) => ({ label: bucketLabel(p.bucket, data.unit), human: p.human, bots: p.bots }));
  const human = points.reduce((a, p) => a + p.human, 0);
  const bots = points.reduce((a, p) => a + p.bots, 0);
  // About 7 labels on the axis whatever the period (24 hours or 30 days), like the design; 4 on phones so they do not collide.
  const phone = useMediaQuery('(max-width: 639px)');
  const interval = Math.max(0, Math.ceil(points.length / (phone ? 4 : 7)) - 1);
  return (
    <div role="img" aria-label={`Line chart: ${fmtNum(human)} human clicks and ${fmtNum(bots)} bot hits (not counted) in the selected period.`} className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* Animation is off: the chart refreshes on every live click and should not jump around (also respects reduced motion). */}
        <ComposedChart data={points} margin={{ top: 8, right: 18, bottom: 0, left: 18 }}>
          <CartesianGrid vertical={false} stroke="#1E1E24" />
          <XAxis
            dataKey="label"
            interval={interval}
            tickLine={false}
            axisLine={{ stroke: '#2A2A32' }}
            tick={{ fill: '#8E8E98', fontSize: 12.5 }}
            tickMargin={8}
          />
          <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.08))]} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#2A2A32' }} />
          <Area
            type="monotone"
            dataKey="human"
            name="Human"
            stroke="#D4FF00"
            strokeWidth={2.5}
            fill="rgba(212,255,0,.16)"
            isAnimationActive={false}
            activeDot={{ r: 4 }}
          />
          <Line type="monotone" dataKey="bots" name="Bots (not counted)" stroke="#71717A" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-[18px] text-[13.5px] text-text-2">
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-1 w-4 rounded-sm bg-accent-600" />
        Human
      </span>
      <span className="flex items-center gap-2">
        <span aria-hidden className="w-4 border-t-[3px] border-dashed border-text-4" />
        Bots (not counted)
      </span>
    </div>
  );
}
