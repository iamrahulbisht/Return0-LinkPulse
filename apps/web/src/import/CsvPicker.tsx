import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Spinner, btnClass } from '../components/ui';

const MAX_BYTES = 1024 * 1024; // same limit as the API (multer fileSize)

/** Quick checks before upload, so people get the message without waiting. The server checks again. */
export function checkCsvFile(file: File): string | null {
  const looksCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  if (!looksCsv) return 'Upload a .csv file.';
  if (file.size > MAX_BYTES) return 'This file is bigger than 1 MB. Split it into smaller files.';
  return null;
}

/**
 * A real <input type="file"> (visually hidden but still focusable) followed by its <label>.
 * Clicking the label or pressing Enter/Space on the focused input opens the file picker;
 * `peer-focus-visible` draws the focus ring on the label.
 */
function HiddenInput({ id, onFile, disabled }: { id: string; onFile: (f: File) => void; disabled?: boolean }) {
  return (
    <input
      id={id}
      type="file"
      accept=".csv,text/csv"
      disabled={disabled}
      className="peer sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        // Clear so picking the same file again still fires onChange.
        e.target.value = '';
        if (f) onFile(f);
      }}
    />
  );
}

export function CsvDropZone({ onFile, busy, error }: { onFile: (f: File) => void; busy: boolean; error?: ReactNode }) {
  const id = useId();
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f && !busy) onFile(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <HiddenInput id={id} onFile={onFile} disabled={busy} />
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed px-5 py-12 text-center transition-colors peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-400 peer-disabled:cursor-wait ${
          over ? 'border-accent-400 bg-accent-50' : 'border-line-strong bg-surface hover:border-accent-400'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent-50 text-accent-700">
          {busy ? <Spinner className="!h-6 !w-6" /> : <Icon name="upload" size={26} />}
        </span>
        <span className="font-display text-[19px] font-bold">{busy ? 'Checking your rows…' : 'Drop your CSV here'}</span>
        {!busy && (
          <span className="text-[14.5px] text-text-3">
            or <span className="font-semibold text-accent-700 underline">choose a file</span>
          </span>
        )}
        <span className="text-[13.5px] text-text-4">Columns: alias, destination, tags. Up to 500 rows.</span>
      </label>
      {error}
    </div>
  );
}

/** "Replace file" button that opens the same kind of picker. */
export function ReplaceFileButton({ onFile, busy, children = 'Replace file' }: { onFile: (f: File) => void; busy: boolean; children?: ReactNode }) {
  const id = useId();
  return (
    <span className="inline-flex">
      <HiddenInput id={id} onFile={onFile} disabled={busy} />
      <label
        htmlFor={id}
        className={btnClass('secondary', 'sm', 'peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-400 peer-disabled:cursor-wait peer-disabled:opacity-60')}
      >
        {busy ? <Spinner /> : null}
        {children}
      </label>
    </span>
  );
}
