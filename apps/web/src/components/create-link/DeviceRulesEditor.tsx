import { useId } from 'react';
import type { Device } from '../../types';
import { Icon } from '../Icon';

export const MAX_RULES = 3;

export interface RuleDraft {
  key: number;
  device: Device;
  destination: string;
}

const DEVICES: { value: Device; label: string }[] = [
  { value: 'ios', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'desktop', label: 'Desktop' },
];

function RuleRow({ rule, index, error, onChange, onRemove }: { rule: RuleDraft; index: number; error?: string; onChange: (r: RuleDraft) => void; onRemove: () => void }) {
  const id = useId();
  const n = index + 1;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="w-5 font-mono text-[12px] text-text-4" aria-hidden>
          {n}
        </span>
        <label htmlFor={`${id}-d`} className="sr-only">
          Device for rule {n}
        </label>
        <select
          id={`${id}-d`}
          value={rule.device}
          onChange={(e) => onChange({ ...rule, device: e.target.value as Device })}
          className="h-[46px] w-[130px] cursor-pointer rounded-[10px] border border-line-strong bg-field px-3 text-[14px] font-semibold text-fg outline-none focus:border-accent-400"
        >
          {DEVICES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-u`} className="sr-only">
          URL for rule {n}
        </label>
        <input
          id={`${id}-u`}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={rule.destination}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : undefined}
          onChange={(e) => onChange({ ...rule, destination: e.target.value })}
          className={`h-[46px] min-w-0 flex-[1_1_160px] rounded-[10px] border-[1.5px] bg-field px-3.5 font-mono text-[13.5px] text-text-2 outline-none focus:bg-[#1F1F24] focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)] ${
            error ? 'border-[#DC2626]' : 'border-line'
          }`}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove rule ${n}`}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] text-text-3 hover:bg-danger-bg hover:text-danger"
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      {error && (
        <span id={`${id}-e`} className="pl-[30px] text-[13.5px] font-semibold text-danger">
          {error}
        </span>
      )}
    </li>
  );
}

export function DeviceRulesEditor({ rules, onChange, errors }: { rules: RuleDraft[]; onChange: (r: RuleDraft[]) => void; errors: Record<string, string> }) {
  const add = () => {
    if (rules.length >= MAX_RULES) return;
    const used = new Set(rules.map((r) => r.device));
    const device = DEVICES.find((d) => !used.has(d.value))?.value ?? 'ios';
    const key = rules.reduce((m, r) => Math.max(m, r.key), 0) + 1;
    onChange([...rules, { key, device, destination: '' }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold">Device rules</span>
        <span className="text-[13.5px] text-text-4">First match wins. Others go to the main URL.</span>
      </div>
      {rules.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {rules.map((r, i) => (
            <RuleRow
              key={r.key}
              rule={r}
              index={i}
              error={errors[`rules.${i}.destination`] ?? errors[`rules.${i}.device`]}
              onChange={(next) => onChange(rules.map((x) => (x.key === r.key ? next : x)))}
              onRemove={() => onChange(rules.filter((x) => x.key !== r.key))}
            />
          ))}
        </ol>
      )}
      {rules.length < MAX_RULES ? (
        <button
          type="button"
          onClick={add}
          className="min-h-[44px] self-start rounded-[10px] border-[1.5px] border-dashed border-accent-300 bg-transparent px-4 text-[14px] font-semibold text-accent-700 hover:bg-accent-50"
        >
          + Add device rule
        </button>
      ) : (
        <span className="text-[13.5px] text-text-4">You can add up to {MAX_RULES} device rules.</span>
      )}
    </div>
  );
}
