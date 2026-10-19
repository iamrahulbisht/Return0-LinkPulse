import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../hooks/useToast';
import type { BioPage } from '../types';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { BioPageCard } from '../components/bio/BioPageCard';
import { BioPageForm } from '../components/bio/BioPageForm';

/** null = form closed, 'new' = create form, a page = edit form for it. */
type Editing = null | 'new' | BioPage;

export function BioPages() {
  const toast = useToast();
  const pages = useAsync(() => api.bio.list(), []);
  const links = useAsync(() => api.links.list({ pageSize: 100 }), []);
  const [editing, setEditing] = useState<Editing>(null);

  const open = (e: Editing) => {
    setEditing(e);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <PageHeader
        title="Bio pages"
        subtitle="One page with all your links, for an Instagram or WhatsApp bio. Clicks from it are tagged as Bio page."
        actions={
          editing === null && (
            <Button variant="primary" icon="plus" onClick={() => open('new')}>
              New bio page
            </Button>
          )
        }
      />

      {editing !== null &&
        (links.error ? (
          <ErrorState message={links.error.message} onRetry={() => void links.reload()} />
        ) : links.loading && !links.data ? (
          <Skeleton className="h-[420px] !rounded-[20px]" />
        ) : (
          <BioPageForm
            // Remount per page so the form state starts from that page.
            key={editing === 'new' ? 'new' : editing.id}
            page={editing === 'new' ? null : editing}
            links={links.data?.items ?? []}
            onCancel={() => setEditing(null)}
            onSaved={(p) => {
              toast(editing === 'new' ? `Page "${p.title}" created` : 'Changes saved');
              setEditing(null);
              void pages.reload(true);
            }}
          />
        ))}

      {pages.error ? (
        <ErrorState message={pages.error.message} onRetry={() => void pages.reload()} />
      ) : pages.loading && !pages.data ? (
        <div role="status" aria-label="Loading bio pages" className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
          <Skeleton className="h-[320px] !rounded-[20px]" />
          <Skeleton className="h-[320px] !rounded-[20px]" />
        </div>
      ) : pages.data?.items.length === 0 ? (
        editing === null && (
          <div className="rounded-[20px] border border-line bg-surface">
            <EmptyState icon="phone" title="No bio pages yet" body="Make one page with your most useful links, then put its address in your Instagram or WhatsApp bio." />
          </div>
        )
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-4">
          {pages.data?.items.map((p) => <BioPageCard key={p.id} page={p} onEdit={() => open(p)} />)}
        </div>
      )}
    </>
  );
}
