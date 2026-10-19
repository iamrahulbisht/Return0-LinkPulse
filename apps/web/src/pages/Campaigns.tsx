import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Campaign } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../hooks/useToast';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { CampaignPicker } from '../components/campaigns/CampaignPicker';
import { CampaignPanel } from '../components/campaigns/CampaignPanel';
import { NewCampaignDialog } from '../components/campaigns/NewCampaignDialog';

export function Campaigns() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const list = useAsync(() => api.campaigns.list(), []);

  const items = list.data?.items ?? [];
  // ?campaign=<id> (from the dashboard cards) picks a campaign; otherwise the first one (running first).
  const wanted = params.get('campaign');
  const selected = items.find((c) => c.id === wanted) ?? items[0];

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('campaign', id);
    setParams(next, { replace: true });
  };

  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const onCreated = (c: Campaign) => {
    setDialogOpen(false);
    toast(`Campaign "${c.name}" created`);
    // Put it on screen straight away, then reload for the server's order and numbers.
    list.setData((prev) => (prev ? { items: [c, ...prev.items] } : { items: [c] }));
    select(c.id);
    void list.reload(true);
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Group links for one event or drive, and compare how they did."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setDialogOpen(true)}>
            New campaign
          </Button>
        }
      />

      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[190px] w-full rounded-[20px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="campaigns"
            title="No campaigns yet"
            body="A campaign groups the links for one event or drive, so you can see how they did together."
            action={<Button onClick={() => setDialogOpen(true)}>Create a campaign</Button>}
          />
        </Card>
      ) : (
        <>
          <CampaignPicker items={items} selectedId={selected?.id ?? ''} onSelect={select} />
          {selected && <CampaignPanel c={selected} />}
        </>
      )}

      <NewCampaignDialog open={dialogOpen} onClose={closeDialog} onCreated={onCreated} />
    </>
  );
}
