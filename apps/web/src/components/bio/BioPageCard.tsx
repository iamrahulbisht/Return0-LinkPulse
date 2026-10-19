import { useToast } from '../../hooks/useToast';
import { fmtNum, plural } from '../../lib/format';
import type { BioPage } from '../../types';
import { Icon } from '../Icon';
import { Button, ShortLink, StatusBadge, btnClass } from '../ui';

export const publicBioUrl = (slug: string) => `${window.location.origin}/b/${slug}`;

export function BioPageCard({ page, onEdit }: { page: BioPage; onEdit: () => void }) {
  const toast = useToast();
  const url = publicBioUrl(page.slug);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast('Page address copied');
    } catch {
      toast('Could not copy. Select the address and copy it yourself.', 'error');
    }
  }

  return (
    <article aria-labelledby={`bio-${page.id}`} className="flex min-w-0 flex-col gap-4 rounded-[20px] border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`bio-${page.id}`} className="m-0 break-words font-display text-[21px] font-bold">{page.title}</h2>
          {page.description && <p className="m-0 text-[14.5px] text-text-3">{page.description}</p>}
        </div>
        <div className="flex flex-col items-end">
          <span className="font-display text-[28px] font-bold leading-none">{fmtNum(page.bioClicks ?? 0)}</span>
          <span className="text-[13px] text-text-4">clicks from this page</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-input bg-subtle p-2 pl-3.5">
        <span className="min-w-0 flex-[1_1_220px] font-mono text-[14px] font-semibold [overflow-wrap:anywhere]">{url}</span>
        <Button size="sm" icon="copy" onClick={() => void copy()} aria-label={`Copy the address of ${page.title}`}>
          Copy
        </Button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={btnClass('secondary', 'sm', 'no-underline hover:text-fg')}>
          <Icon name="external" size={17} />
          Open page
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[14px] font-semibold text-text-2">{plural(page.links.length, 'button')}</h3>
        {page.links.length === 0 ? (
          <span className="text-[14px] text-text-4">No buttons yet. Edit the page to add your links.</span>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-0 p-0">
            {page.links.map((l) => (
              <li key={l.linkId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line-soft py-2.5 first:border-t-0">
                <div className="flex min-w-0 flex-[1_1_200px] flex-col">
                  <span className="break-words text-[15px] font-semibold">{l.label}</span>
                  <ShortLink code={l.code} className="truncate text-[13px] !font-normal text-text-3" />
                </div>
                <StatusBadge status={l.status} />
                <span className="min-w-[84px] text-right text-[14px] text-text-2">
                  <span className="font-mono font-bold text-fg">{fmtNum(l.bioClicks ?? 0)}</span> {l.bioClicks === 1 ? 'click' : 'clicks'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button icon="edit" onClick={onEdit} aria-label={`Edit ${page.title}`}>
          Edit page
        </Button>
      </div>
    </article>
  );
}
