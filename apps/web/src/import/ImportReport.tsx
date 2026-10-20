import { useState } from 'react';
import { fmtNum } from '../lib/format';
import type { ImportPreview, ImportResult, ImportRow } from '../types';

/** A row as shown in the report: the API result, or "imported" once the commit created the link. */
export type ReportRow = ImportRow & { imported?: boolean };

const RESULT: Record<ImportResult | 'imported', { word: string; icon: string; badge: string; row: string }> = {
  valid: { word: 'Valid', icon: '✓', badge: 'bg-ok-bg text-ok', row: '' },
  imported: { word: 'Imported', icon: '✓', badge: 'bg-ok-bg text-ok', row: '' },
  alias_taken: { word: 'Alias used', icon: '!', badge: 'bg-warn-bg text-warn', row: 'bg-[#1A170C]' },
  duplicate_in_file: { word: 'Alias repeated', icon: '!', badge: 'bg-warn-bg text-warn', row: 'bg-[#1A170C]' },
  invalid_url: { word: 'Invalid URL', icon: '×', badge: 'bg-danger-bg text-danger', row: 'bg-[#1A1212]' },
  invalid_alias: { word: 'Invalid alias', icon: '×', badge: 'bg-danger-bg text-danger', row: 'bg-[#1A1212]' },
  blocked_domain: { word: 'Blocked domain', icon: '×', badge: 'bg-danger-bg text-danger', row: 'bg-[#1A1212]' },
};

export const resultWord = (r: ImportResult) => RESULT[r].word;
export const isProblem = (r: ReportRow) => !r.imported && r.result !== 'valid';

export function SummaryTiles({ summary }: { summary: ImportPreview['summary'] }) {
  const tiles = [
    { n: summary.valid, label: 'Ready to import', box: 'border-ok-line bg-ok-bg', num: 'text-[#86EFAC]', text: 'text-[#86EFAC]' },
    { n: summary.alias_taken + summary.duplicate_in_file, label: 'Alias already used', box: 'border-warn-line bg-warn-bg', num: 'text-[#FDE68A]', text: 'text-warn' },
    { n: summary.invalid_url + summary.invalid_alias, label: 'Invalid URL', box: 'border-danger-line bg-danger-bg', num: 'text-[#FCA5A5]', text: 'text-[#FCA5A5]' },
    { n: summary.blocked_domain, label: 'Blocked domain', box: 'border-danger-line bg-danger-bg', num: 'text-[#FCA5A5]', text: 'text-[#FCA5A5]' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] sm:gap-3.5">
      {tiles.map((t) => (
        <div key={t.label} className={`flex flex-col gap-1 rounded-[16px] border px-5 py-[18px] ${t.box}`}>
          <span className={`font-display text-[34px] font-bold leading-tight ${t.num}`}>{fmtNum(t.n)}</span>
          <span className={`text-[14.5px] font-semibold ${t.text}`}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportTable({ rows, importedNote }: { rows: ReportRow[]; importedNote: string }) {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const problems = rows.filter(isProblem);
  const shown = problemsOnly ? problems : rows;
  const tab = (on: boolean) => `min-h-[44px] cursor-pointer rounded-chip border-0 px-3.5 text-[14px] font-semibold ${on ? 'bg-accent-400 font-bold text-black' : 'bg-transparent text-text-3 hover:text-fg'}`;

  return (
    <section aria-labelledby="import-report-title" className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
        <h2 id="import-report-title" className="m-0 font-display text-[20px] font-bold">Row-by-row report</h2>
        <div role="group" aria-label="Show rows" className="flex gap-[3px] rounded-[10px] bg-line-soft p-[3px]">
          <button type="button" aria-pressed={!problemsOnly} onClick={() => setProblemsOnly(false)} className={tab(!problemsOnly)}>
            All {fmtNum(rows.length)}
          </button>
          <button type="button" aria-pressed={problemsOnly} onClick={() => setProblemsOnly(true)} className={tab(problemsOnly)}>
            Problems only ({fmtNum(problems.length)})
          </button>
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[14.5px]">
          <thead>
            <tr className="bg-subtle text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
              <th scope="col" className="w-[70px] px-5 py-3 font-semibold">Row</th>
              <th scope="col" className="px-2 py-3 font-semibold">Alias</th>
              <th scope="col" className="px-2 py-3 font-semibold">Destination</th>
              <th scope="col" className="px-2 py-3 font-semibold">Result</th>
              <th scope="col" className="py-3 pl-2 pr-5 font-semibold">How to fix</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr className="border-t border-line-soft">
                <td colSpan={5} className="px-5 py-8 text-center text-text-3">No problems. Every row is fine.</td>
              </tr>
            )}
            {shown.map((r) => {
              const s = RESULT[r.imported ? 'imported' : r.result];
              return (
                <tr key={r.row} className={`border-t border-line-soft ${s.row}`}>
                  <td className="px-5 py-[13px] font-mono text-text-4">{r.row}</td>
                  <td className="px-2 py-[13px] font-mono font-semibold">{r.alias || <span className="font-sans font-normal text-text-4">(random)</span>}</td>
                  <td className="max-w-[320px] truncate px-2 py-[13px] font-mono text-[13px] text-text-2" title={r.destination}>
                    {r.destination || <span className="font-sans text-text-4">(empty)</span>}
                  </td>
                  <td className="px-2 py-[13px]">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-bold ${s.badge}`}>
                      <span aria-hidden>{s.icon}</span>
                      {s.word}
                    </span>
                  </td>
                  <td className="py-[13px] pl-2 pr-5 text-[14px] text-text-2">{r.imported ? importedNote : (r.fix ?? '—')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
