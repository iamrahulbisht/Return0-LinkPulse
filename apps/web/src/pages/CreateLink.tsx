// The 2-step "Create a link" wizard (LinkPulse-UI/create-link.html), wired to /links/validate and POST /links.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CreateLinkBody, Link, QrCode, ValidateResult } from '../types';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../hooks/useToast';
import { WizardHeader, type WizardStep } from '../components/create-link/Stepper';
import { PLACEHOLDER_CHECKS, type Check } from '../components/create-link/LiveChecks';
import { DestinationStep, type Tone } from '../components/create-link/DestinationStep';
import { OptionsStep, type OptionsValues } from '../components/create-link/OptionsStep';
import { PreviewPanel, type JourneyStep } from '../components/create-link/PreviewPanel';
import { SuccessPanel } from '../components/create-link/SuccessPanel';
import { buildReview, expiryInstant, parseLimit } from '../components/create-link/review';

// Destination and alias are joined into one debounced key, so a single timer covers both inputs.
const SEP = '\u0000';

interface CheckResult {
  key: string;
  result: ValidateResult | null;
  error: string | null;
}

const emptyOptions = (campaignId: string): OptionsValues => ({
  campaignId,
  tags: [],
  expiresOn: '',
  fallbackUrl: '',
  clickLimit: '',
  pwOn: false,
  password: '',
  rules: [],
});

/** Server field names → the option they belong to. */
function errorKey(field: string): string {
  if (field === 'expiresOn') return 'expiresAt';
  if (field.startsWith('tags')) return 'tags';
  return field;
}
const KNOWN_FIELDS = new Set(['destination', 'alias', 'campaignId', 'tags', 'expiresAt', 'fallbackUrl', 'clickLimit', 'password']);

export function CreateLink() {
  const [params] = useSearchParams();
  const presetCampaign = params.get('campaign') ?? '';
  const toast = useToast();
  const { refresh } = useAuth();

  const [step, setStep] = useState<WizardStep>(1);
  const [destination, setDestination] = useState('');
  const [alias, setAlias] = useState('');
  const [options, setOptions] = useState<OptionsValues>(() => emptyOptions(presetCampaign));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Set when publish returned 409 ALIAS_TAKEN; applies while the alias is still the one that clashed.
  const [conflict, setConflict] = useState<{ alias: string; suggestions: string[] } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [created, setCreated] = useState<{ link: Link; qr: QrCode | null } | null>(null);

  const campaigns = useAsync(() => api.campaigns.list(), []);
  const tagList = useAsync(() => api.tags.list(), []);

  // ---- live checks (300 ms after typing stops; out-of-date answers are dropped) ----
  const inputKey = `${destination}${SEP}${alias}`;
  const debouncedKey = useDebounce(inputKey, 300);
  const [recheck, setRecheck] = useState(0);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const [d = '', a = ''] = debouncedKey.split(SEP);
    const id = ++seq.current;
    api.links.validate(d.trim(), a.trim()).then(
      (result) => {
        if (id === seq.current) setCheck({ key: debouncedKey, result, error: null });
      },
      (e: unknown) => {
        if (id === seq.current) {
          setCheck({ key: debouncedKey, result: null, error: e instanceof ApiError ? e.message : 'Could not check right now. Please try again.' });
        }
      },
    );
  }, [debouncedKey, recheck]);

  const fresh = check !== null && check.key === inputKey && check.result !== null;
  const result = check?.result ?? null;
  const aliasValue = alias.trim();
  const conflictActive = conflict !== null && conflict.alias === aliasValue;

  const checks: Check[] = useMemo(() => {
    const list = result?.checks ?? PLACEHOLDER_CHECKS;
    if (!conflictActive) return list;
    return list.map((c) => (c.id === 'alias' ? { ...c, state: 'bad' as const, note: 'That alias was just taken. Pick another one.' } : c));
  }, [result, conflictActive]);

  const hasUrl = destination.trim() !== '';
  const urlChecks = checks.filter((c) => c.id !== 'alias');
  const urlBad = urlChecks.find((c) => c.state === 'bad');
  const urlOk = urlChecks.every((c) => c.state === 'ok');
  const urlTone: Tone = errors.destination || (hasUrl && urlBad) ? 'bad' : hasUrl && urlOk ? 'ok' : 'neutral';
  const urlHelp = errors.destination ?? (hasUrl && urlBad ? urlBad.note : hasUrl && urlOk ? 'Destination checked' : 'Must start with http:// or https://');

  const aliasCheck = checks.find((c) => c.id === 'alias') ?? PLACEHOLDER_CHECKS[3];
  const aliasBad = !!errors.alias || (aliasValue !== '' && aliasCheck.state === 'bad');
  const aliasTone: Tone = aliasBad ? 'bad' : aliasValue ? 'ok' : 'neutral';
  const aliasHelp = errors.alias ?? (aliasValue ? aliasCheck.note : 'We will make a random 7-character code');
  const suggestions = conflictActive ? conflict.suggestions : aliasValue && result?.alias.state === 'bad' ? result.alias.suggestions : [];

  const badCount = checks.filter((c) => c.state === 'bad').length;
  const waitCount = checks.filter((c) => c.state === 'wait').length;
  const checkFailed = check !== null && check.key === inputKey && check.error !== null;
  let gate: { text: string; tone: Tone };
  if (!hasUrl) gate = { text: 'Add a destination URL to continue', tone: 'neutral' };
  else if (checkFailed) gate = { text: check.error ?? 'Could not check right now.', tone: 'bad' };
  else if (!fresh) gate = { text: 'Checking…', tone: 'neutral' };
  else if (badCount > 0) gate = { text: `Fix ${badCount} ${badCount === 1 ? 'issue' : 'issues'} to continue`, tone: 'bad' };
  else if (waitCount > 0) gate = { text: 'Add a destination URL to continue', tone: 'neutral' };
  else gate = { text: 'All checks passed', tone: 'ok' };
  const canContinue = fresh && !!result?.ok && !conflictActive && !errors.destination && !errors.alias;

  // ---- options + review ----
  // If ?campaign= is not one of the user's campaigns, fall back to "No campaign" instead of sending a bad id.
  const campaignItems = campaigns.data?.items;
  const campaignId = campaignItems && !campaignItems.some((c) => c.id === options.campaignId) ? '' : options.campaignId;
  const review = useMemo(() => buildReview(options), [options]);
  const fixCount = review.filter((r) => r.tone === 'fix').length;
  const exp = expiryInstant(options.expiresOn);
  const expiryPast = exp !== null && exp.getTime() <= Date.now();
  const limit = parseLimit(options.clickLimit);

  const clearError = (...keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });

  const setOption = <K extends keyof OptionsValues>(key: K, value: OptionsValues[K]) => {
    setOptions((o) => ({ ...o, [key]: value }));
    if (key === 'rules') setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('rules.'))));
    else if (key === 'expiresOn') clearError('expiresAt', 'fallbackUrl');
    else if (key === 'pwOn') clearError('password');
    else clearError(String(key));
  };

  // Move focus to the new step's heading, so keyboard and screen-reader users start at the top.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);

  function handlePublishError(e: unknown) {
    if (!(e instanceof ApiError)) {
      toast('Something went wrong. Please try again.', 'error');
      return;
    }
    if (e.status === 429 || e.code === 'RATE_LIMITED') {
      toast(e.message, 'error');
      return;
    }
    if (e.code === 'ALIAS_TAKEN') {
      setConflict({ alias: aliasValue, suggestions: e.fields.find((f) => f.field === 'alias')?.suggestions ?? e.fields[0]?.suggestions ?? [] });
      setRecheck((n) => n + 1);
      setStep(1);
      return;
    }
    if (e.fields.length) {
      const map: Record<string, string> = {};
      for (const f of e.fields) {
        const k = errorKey(f.field);
        if (!map[k]) map[k] = f.message;
      }
      setErrors(map);
      if (map.destination || map.alias) setStep(1);
      const unplaced = Object.keys(map).some((k) => !KNOWN_FIELDS.has(k) && !/^rules\.\d+\.(destination|device)$/.test(k));
      if (unplaced) toast(e.message, 'error');
      return;
    }
    toast(e.message, 'error');
  }

  async function publish() {
    if (fixCount > 0 || publishing) return;
    setPublishing(true);
    setErrors({});
    const fallback = options.fallbackUrl.trim();
    const body: CreateLinkBody = {
      destination: destination.trim(),
      alias: aliasValue || null,
      campaignId: campaignId || null,
      tags: options.tags,
      expiresOn: options.expiresOn || null,
      fallbackUrl: options.expiresOn && fallback ? fallback : null,
      clickLimit: typeof limit === 'number' ? limit : null,
      password: options.pwOn ? options.password : null,
      rules: options.rules.map((r) => ({ device: r.device, destination: r.destination.trim() })),
    };
    let link: Link;
    try {
      link = (await api.links.create(body)).link;
    } catch (e) {
      handlePublishError(e);
      setPublishing(false);
      return;
    }
    void refresh().catch(() => undefined);
    let qr: QrCode | null = null;
    try {
      qr = (await api.links.createQr(link.id, 'Main QR', '#0B0B0F')).qr;
    } catch {
      // The link is live either way; the QR can be made later on the QR codes page.
      qr = null;
    }
    setCreated({ link, qr });
    setPublishing(false);
    setStep(3);
  }

  function reset() {
    setDestination('');
    setAlias('');
    setOptions(emptyOptions(presetCampaign));
    setErrors({});
    setConflict(null);
    setCreated(null);
    setStep(1);
  }

  const journey: JourneyStep[] = [
    { label: 'Link is active', on: true },
    { label: 'Expiry date', on: !!options.expiresOn },
    { label: 'Password gate', on: options.pwOn },
    { label: 'Bot filter', on: true },
    { label: 'Click limit', on: typeof limit === 'number' },
    { label: 'Device rules', on: options.rules.length > 0 },
  ];
  const previewHost = hasUrl ? (result?.destination.host ?? null) : null;

  return (
    <div className="flex min-h-screen flex-col bg-ground font-sans text-fg">
      <WizardHeader step={step} />
      <main className="flex-1 px-4 pb-14 pt-9 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-7">
          <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-5">
            {step === 1 && (
              <DestinationStep
                ref={headingRef}
                destination={destination}
                onDestination={(v) => {
                  setDestination(v);
                  clearError('destination');
                }}
                urlTone={urlTone}
                urlHelp={urlHelp}
                alias={alias}
                onAlias={(v) => {
                  setAlias(v.replace(/\s/g, '').toLowerCase());
                  clearError('alias');
                }}
                onRandom={() => {
                  setAlias('');
                  clearError('alias');
                }}
                aliasTone={aliasTone}
                aliasHelp={aliasHelp}
                suggestions={suggestions}
                checks={checks}
                stale={!fresh && check !== null && !checkFailed}
                gate={gate}
                onRetryCheck={checkFailed ? () => setRecheck((n) => n + 1) : null}
                canContinue={canContinue}
                onContinue={() => {
                  if (canContinue) setStep(2);
                }}
              />
            )}
            {step === 2 && (
              <OptionsStep
                ref={headingRef}
                values={{ ...options, campaignId }}
                onChange={setOption}
                campaigns={campaignItems}
                campaignsError={campaigns.error ? 'Could not load your campaigns.' : null}
                knownTags={(tagList.data?.items ?? []).map((t) => t.name)}
                errors={errors}
                review={review}
                expiryPast={expiryPast}
                limitBad={limit === 'bad'}
                publishing={publishing}
                onBack={() => setStep(1)}
                onPublish={publish}
              />
            )}
            {step === 3 && created && <SuccessPanel ref={headingRef} link={created.link} qr={created.qr} onReset={reset} />}
          </div>
          <PreviewPanel
            code={created?.link.code ?? aliasValue}
            host={created ? hostOf(created.link.destination) : previewHost}
            journey={journey}
            published={!!created?.qr}
          />
        </div>
      </main>
    </div>
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
