import { forwardRef, type ReactNode } from 'react';
import type { Campaign } from '../../types';
import { istDateKey } from '../../lib/format';
import { Button, Field, Switch } from '../ui';
import { Icon, type IconName } from '../Icon';
import { TagInput } from './TagInput';
import { DeviceRulesEditor, type RuleDraft } from './DeviceRulesEditor';
import { ReviewPanel } from './ReviewPanel';
import type { ReviewItem } from './review';

export interface OptionsValues {
  campaignId: string;
  tags: string[];
  expiresOn: string;
  fallbackUrl: string;
  clickLimit: string;
  pwOn: boolean;
  password: string;
  rules: RuleDraft[];
}

export interface OptionsStepProps {
  values: OptionsValues;
  onChange: <K extends keyof OptionsValues>(key: K, value: OptionsValues[K]) => void;
  campaigns: Campaign[] | undefined;
  campaignsError: string | null;
  knownTags: string[];
  errors: Record<string, string>;
  review: ReviewItem[];
  expiryPast: boolean;
  limitBad: boolean;
  publishing: boolean;
  onBack: () => void;
  onPublish: () => void;
}

function GaugeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 16 0" />
      <path d="M12 12l4-3" />
      <path d="M4 16h16" />
    </svg>
  );
}

function OptionRow({ icon, title, titleFor, titleId, sub, control, children, first }: {
  icon: IconName | 'gauge';
  title: string;
  titleFor?: string;
  titleId?: string;
  sub: string;
  control: ReactNode;
  children?: ReactNode;
  first?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 px-5 py-[18px] ${first ? '' : 'border-t border-line-soft'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-input bg-accent-50 text-accent-700">
            {icon === 'gauge' ? <GaugeIcon /> : <Icon name={icon} size={20} />}
          </span>
          <div className="flex flex-col">
            {titleFor ? (
              <label htmlFor={titleFor} className="text-[15px] font-semibold">
                {title}
              </label>
            ) : (
              <span id={titleId} className="text-[15px] font-semibold">
                {title}
              </span>
            )}
            <span className="text-[13.5px] text-text-4">{sub}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{control}</div>
      </div>
      {children}
    </div>
  );
}

const SMALL_INPUT = 'h-[46px] rounded-[10px] border-[1.5px] bg-field px-3 text-[15px] text-fg outline-none focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)]';

export const OptionsStep = forwardRef<HTMLHeadingElement, OptionsStepProps>(function OptionsStep(p, ref) {
  const v = p.values;
  const fixCount = p.review.filter((r) => r.tone === 'fix').length;
  const expiryErr = p.errors.expiresAt;
  const limitErr = p.errors.clickLimit;
  const pwErr = p.errors.password;

  return (
    <section className="flex flex-col gap-[26px] rounded-[20px] border border-line bg-surface p-5 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h1 ref={ref} tabIndex={-1} className="m-0 font-display text-[30px] font-bold tracking-[-0.02em] outline-none">
          Set the rules
        </h1>
        <p className="m-0 text-[15.5px] text-text-3">All optional. Turn on only what this link needs.</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-[18px]">
        <div className="flex flex-col gap-2">
          <label htmlFor="cl-camp" className="text-[14.5px] font-semibold">
            Campaign
          </label>
          <select
            id="cl-camp"
            value={v.campaignId}
            onChange={(e) => p.onChange('campaignId', e.target.value)}
            disabled={!p.campaigns && !p.campaignsError}
            aria-describedby={p.errors.campaignId || p.campaignsError ? 'cl-camp-msg' : undefined}
            className="h-[54px] rounded-input border-[1.5px] border-line-strong bg-surface px-3.5 text-[15px] text-fg"
          >
            <option value="">No campaign</option>
            {(p.campaigns ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {(p.errors.campaignId || p.campaignsError) && (
            <span id="cl-camp-msg" className="text-[13.5px] font-semibold text-danger">
              {p.errors.campaignId ?? p.campaignsError}
            </span>
          )}
        </div>
        <TagInput tags={v.tags} onChange={(t) => p.onChange('tags', t)} known={p.knownTags} error={p.errors.tags} />
      </div>

      <div className="flex flex-col overflow-hidden rounded-[16px] border border-line">
        <OptionRow
          first
          icon="clock"
          title="Expiry date"
          titleFor="cl-exp"
          sub="Stops working after this time (IST)"
          control={
            <>
              <input
                id="cl-exp"
                type="date"
                min={istDateKey()}
                value={v.expiresOn}
                onChange={(e) => p.onChange('expiresOn', e.target.value)}
                aria-invalid={p.expiryPast || expiryErr ? true : undefined}
                aria-describedby={expiryErr ? 'cl-exp-msg' : undefined}
                className={`${SMALL_INPUT} ${p.expiryPast || expiryErr ? 'border-[#DC2626]' : 'border-line-strong'}`}
              />
              <span className="font-mono text-[13.5px] text-text-3">{v.expiresOn ? '11:59 PM IST' : ''}</span>
              {v.expiresOn && (
                <Button size="sm" variant="ghost" onClick={() => p.onChange('expiresOn', '')} aria-label="Remove expiry date">
                  Remove
                </Button>
              )}
            </>
          }
        >
          {expiryErr && (
            <span id="cl-exp-msg" className="text-[13.5px] font-semibold text-danger">
              {expiryErr}
            </span>
          )}
          {v.expiresOn && (
            <Field
              label="Fallback URL (optional)"
              type="url"
              inputMode="url"
              placeholder="https://"
              mono
              value={v.fallbackUrl}
              onChange={(e) => p.onChange('fallbackUrl', e.target.value)}
              error={p.errors.fallbackUrl}
              hint="Where visitors go after it expires. Leave empty to show an “Expired” page."
            />
          )}
        </OptionRow>

        <OptionRow
          icon="gauge"
          title="Click limit"
          titleFor="cl-lim"
          sub="Only human clicks count. Bots never use it up."
          control={
            <input
              id="cl-lim"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              step={1}
              placeholder="No limit"
              value={v.clickLimit}
              onChange={(e) => p.onChange('clickLimit', e.target.value)}
              aria-invalid={p.limitBad || limitErr ? true : undefined}
              aria-describedby={limitErr ? 'cl-lim-msg' : undefined}
              className={`${SMALL_INPUT} w-[140px] font-mono ${p.limitBad || limitErr ? 'border-[#DC2626]' : 'border-line-strong'}`}
            />
          }
        >
          {limitErr && (
            <span id="cl-lim-msg" className="text-[13.5px] font-semibold text-danger">
              {limitErr}
            </span>
          )}
        </OptionRow>

        <OptionRow
          icon="lock"
          title="Password"
          titleId="cl-pw-title"
          sub="Visitors type it before they are sent on"
          control={
            <>
              {v.pwOn && (
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label="Link password"
                  placeholder="At least 4 characters"
                  value={v.password}
                  onChange={(e) => p.onChange('password', e.target.value)}
                  aria-invalid={pwErr ? true : undefined}
                  aria-describedby={pwErr ? 'cl-pw-msg' : undefined}
                  className={`${SMALL_INPUT} w-[200px] max-w-full ${pwErr ? 'border-[#DC2626]' : 'border-line-strong'}`}
                />
              )}
              <Switch checked={v.pwOn} onChange={(on) => p.onChange('pwOn', on)} label="Password" />
            </>
          }
        >
          {pwErr && (
            <span id="cl-pw-msg" className="text-[13.5px] font-semibold text-danger">
              {pwErr}
            </span>
          )}
        </OptionRow>
      </div>

      <DeviceRulesEditor rules={v.rules} onChange={(r) => p.onChange('rules', r)} errors={p.errors} />

      <ReviewPanel items={p.review} />

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-[22px]">
        <Button onClick={p.onBack}>
          Back
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          {fixCount > 0 && (
            <span className="text-[14px] font-semibold text-danger">
              Fix {fixCount} {fixCount === 1 ? 'issue' : 'issues'} to publish
            </span>
          )}
          <Button variant="primary" size="lg" disabled={fixCount > 0} busy={p.publishing} onClick={p.onPublish}>
            {p.publishing ? 'Publishing…' : 'Publish link'}
          </Button>
        </div>
      </div>
    </section>
  );
});
