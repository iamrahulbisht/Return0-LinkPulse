import { useId, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { plural } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { ImportPreview } from '../types';
import { Icon } from '../components/Icon';
import { Button, ErrorState, PageHeader, Spinner, btnClass } from '../components/ui';
import { ImportStepper } from '../components/import/ImportStepper';
import { CsvDropZone, ReplaceFileButton, checkCsvFile } from '../components/import/CsvPicker';
import { ReportTable, SummaryTiles, isProblem, resultWord, type ReportRow } from '../components/import/ImportReport';
import { TEMPLATE_CSV, downloadText, toCsv } from '../components/import/csv';
import { PasteLinksBox, checkPastedText } from '../components/import/PasteLinks';

type Source = 'csv' | 'paste';

interface Done {
  imported: number;
  skipped: number;
  campaignId: string | null;
  campaignName: string | null;
}

export function BulkImport() {
  const toast = useToast();
  const { refresh } = useAuth();
  const campaignSelectId = useId();
  const campaigns = useAsync(() => api.campaigns.list(), []);

  const [source, setSource] = useState<Source>('csv');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const validRows = useMemo(() => rows.filter((r) => r.result === 'valid' && !r.imported), [rows]);
  const problemRows = useMemo(() => rows.filter(isProblem), [rows]);
  const campaignName = (id: string | null) => campaigns.data?.items.find((c) => c.id === id)?.name ?? null;

  /** CSV and pasted links both end in the same row-by-row report. */
  async function runPreview(load: () => Promise<ImportPreview>, failMessage: string) {
    setUploadError(null);
    setImportError(null);
    setChecking(true);
    try {
      const p = await load();
      setPreview(p);
      setRows(p.rows);
      setDone(null);
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : failMessage);
      // A failed replace goes back to the upload step so the error sits next to the drop zone.
      setPreview(null);
      setRows([]);
      setDone(null);
    } finally {
      setChecking(false);
    }
  }

  function onFile(file: File) {
    const bad = checkCsvFile(file);
    if (bad) {
      setUploadError(bad);
      return;
    }
    void runPreview(() => api.import.preview(file), 'Could not read that file. Please try again.');
  }

  function onPaste() {
    const bad = checkPastedText(pasteText);
    if (bad) {
      setUploadError(bad);
      return;
    }
    void runPreview(() => api.import.previewText(pasteText), 'Could not check those links. Please try again.');
  }

  function pickSource(next: Source) {
    if (checking) return;
    setSource(next);
    setUploadError(null);
  }

  /** Back to the paste box. After an import the box is cleared so the same links are not imported twice. */
  function editPasted() {
    if (done) setPasteText('');
    setPreview(null);
    setRows([]);
    setDone(null);
    setUploadError(null);
    setImportError(null);
  }

  async function onImport() {
    if (!validRows.length) return;
    setImporting(true);
    setImportError(null);
    const target = campaignId || null;
    try {
      const res = await api.import.commit(
        validRows.map(({ row, alias, destination, tags }) => ({ row, alias, destination, tags })),
        target,
      );
      // The server re-checks; a row can fail now (alias taken since the preview), so take its answer per row.
      const byRow = new Map(res.rows.map((r) => [r.row, r]));
      setRows((prev) =>
        prev.map((r) => {
          const n = byRow.get(r.row);
          if (!n) return r;
          return { ...r, ...n, imported: Boolean(n.linkId) };
        }),
      );
      setDone({ imported: res.imported, skipped: rows.length - res.imported, campaignId: target, campaignName: campaignName(target) });
      toast(`${plural(res.imported, 'link')} imported.`);
      void refresh().catch(() => undefined);
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : 'Could not import. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function downloadReport() {
    if (!preview) return;
    const body = problemRows.map((r) => [r.row, r.alias, r.destination, r.tags.join(' '), resultWord(r.result), r.fix ?? '']);
    const base = source === 'paste' ? 'pasted-links' : preview.fileName.replace(/\.csv$/i, '') || 'import';
    downloadText(`${base}-problems.csv`, toCsv([['row', 'alias', 'destination', 'tags', 'result', 'how_to_fix'], ...body]));
  }

  const step = done ? 2 : preview ? 1 : 0;
  const importedNote = done?.campaignName ? `Added to ${done.campaignName}` : 'Added to your links';
  const tab = (on: boolean) =>
    `inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-chip border-0 px-4 text-[14.5px] font-semibold disabled:cursor-wait ${
      on ? 'bg-accent-400 font-bold text-black' : 'bg-transparent text-text-3 hover:text-fg'
    }`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Bulk import" subtitle="Upload a CSV or paste links. We check every one and import only the good ones." />
        <ImportStepper current={step} allDone={Boolean(done)} />
      </div>

      {done && (
        <div role="status" className="flex flex-wrap items-center gap-3.5 rounded-[16px] border border-ok-line bg-ok-bg px-5 py-[18px]">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#16A34A] text-white">
            <Icon name="check" size={18} strokeWidth={3} />
          </span>
          <span className="min-w-[200px] flex-1 text-[15.5px] text-[#86EFAC]">
            <strong>
              {done.imported === 0
                ? 'No links were imported.'
                : `${plural(done.imported, 'link')} imported${done.campaignName ? ` into ${done.campaignName}` : ''}.`}
            </strong>
            {done.skipped > 0 &&
              ` ${plural(done.skipped, 'row')} ${done.skipped === 1 ? 'was' : 'were'} skipped. Fix them in the report and ${source === 'paste' ? 'paste them' : 'upload'} again.`}
          </span>
          {done.imported > 0 && (
            <RouterLink
              to={done.campaignId ? `/links?campaign=${encodeURIComponent(done.campaignId)}` : '/links'}
              className="inline-flex min-h-[44px] items-center text-[15px] font-bold text-[#86EFAC] hover:text-[#86EFAC]"
            >
              See the new links
            </RouterLink>
          )}
        </div>
      )}

      {!preview ? (
        <section aria-label={source === 'paste' ? 'Paste links' : 'Upload a CSV file'} className="flex flex-col gap-3">
          <div role="group" aria-label="How to add links" className="flex gap-[3px] self-start rounded-[12px] bg-line-soft p-[3px]">
            <button type="button" aria-pressed={source === 'csv'} onClick={() => pickSource('csv')} disabled={checking} className={tab(source === 'csv')}>
              <Icon name="upload" size={16} />
              Upload CSV
            </button>
            <button type="button" aria-pressed={source === 'paste'} onClick={() => pickSource('paste')} disabled={checking} className={tab(source === 'paste')}>
              <Icon name="links" size={16} />
              Paste links
            </button>
          </div>
          {source === 'csv' ? (
            <>
              <CsvDropZone onFile={onFile} busy={checking} error={uploadError && <ErrorState message={uploadError} />} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-text-3">
                <span>Not sure about the format?</span>
                <button
                  type="button"
                  onClick={() => downloadText('linkpulse-import-template.csv', TEMPLATE_CSV)}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-semibold text-accent-700 underline hover:text-accent-800"
                >
                  <Icon name="download" size={16} />
                  Download a template CSV
                </button>
              </div>
            </>
          ) : (
            <PasteLinksBox
              value={pasteText}
              onChange={(t) => {
                setPasteText(t);
                if (uploadError) setUploadError(null);
              }}
              onSubmit={onPaste}
              busy={checking}
              error={uploadError && <ErrorState message={uploadError} />}
            />
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-[16px] border border-line bg-surface px-5 py-4">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-input bg-accent-50 text-accent-700">
              <Icon name={source === 'paste' ? 'links' : 'file'} size={22} />
            </span>
            <div className="flex min-w-[200px] flex-1 flex-col">
              <span className="break-all font-mono text-[15px] font-semibold">{preview.fileName}</span>
              <span className="text-[13.5px] text-text-4">
                {source === 'paste'
                  ? `${plural(preview.summary.total, 'link')} · each gets a random short code`
                  : `${plural(preview.summary.total, 'row')} · columns: ${preview.columns.join(', ')}`}
              </span>
            </div>
            {source === 'paste' ? (
              <Button size="sm" onClick={editPasted} disabled={importing}>
                {done ? 'Paste more links' : 'Edit pasted links'}
              </Button>
            ) : (
              <ReplaceFileButton onFile={onFile} busy={checking}>
                {done ? 'Upload another file' : 'Replace file'}
              </ReplaceFileButton>
            )}
          </div>
          {uploadError && <ErrorState message={uploadError} />}

          <SummaryTiles summary={preview.summary} />

          <ReportTable rows={rows} importedNote={importedNote} />

          {importError && <ErrorState message={importError} onRetry={() => void onImport()} />}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-ink px-[22px] py-[18px] text-white">
            <div className="flex flex-wrap items-center gap-3 text-[15px]">
              <label htmlFor={campaignSelectId} className="font-semibold">Import into</label>
              <select
                id={campaignSelectId}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                disabled={Boolean(done) || importing}
                className="h-[46px] min-w-0 max-w-full rounded-input border-0 bg-surface px-3 text-[15px] text-fg disabled:opacity-70"
              >
                {campaigns.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="">No campaign</option>
              </select>
              {campaigns.loading && <Spinner />}
              {campaigns.error && <span className="text-[13.5px] text-[#FCA5A5]">Could not load campaigns.</span>}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={downloadReport}
                disabled={problemRows.length === 0}
                className="inline-flex h-[50px] cursor-pointer items-center gap-2 rounded-input border-[1.5px] border-white/30 bg-transparent px-[18px] text-[15px] font-semibold text-white hover:bg-white/[.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="download" size={17} />
                Download error report
              </button>
              {done ? (
                <span className={btnClass('primary', 'md', '!h-[50px] !cursor-default !bg-[#86EFAC] px-[22px]')}>
                  <Icon name="check" size={17} />
                  Imported
                </span>
              ) : (
                <Button variant="primary" className="!h-[50px] px-[22px]" onClick={() => void onImport()} busy={importing} disabled={validRows.length === 0}>
                  {validRows.length === 0 ? 'No valid links to import' : `Import ${plural(validRows.length, 'valid link')}`}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
