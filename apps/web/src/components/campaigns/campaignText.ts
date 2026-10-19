// Shared wording and colours for campaign state, used by the Campaigns page and the Dashboard cards.
import type { Campaign, CampaignState } from '../../types';
import { fmtDate, fmtDay } from '../../lib/format';

/** Short state word for the campaign picker ("Running", "Ended · data kept", ...). */
export function campaignStateLabel(state: CampaignState): string {
  switch (state) {
    case 'running':
      return 'Running';
    case 'ended':
      return 'Ended · data kept';
    case 'scheduled':
      return 'Scheduled';
    default:
      return 'No dates set';
  }
}

/** State with its key date, for compact cards: "Running · ends 30 Oct", "Scheduled · starts 1 Nov". */
export function campaignStateWithDate(c: Pick<Campaign, 'state' | 'startsAt' | 'endsAt'>): string {
  if (c.state === 'running') return c.endsAt ? `Running · ends ${fmtDay(c.endsAt)}` : 'Running';
  if (c.state === 'scheduled') return c.startsAt ? `Scheduled · starts ${fmtDay(c.startsAt)}` : 'Scheduled';
  return campaignStateLabel(c.state);
}

/** "1 Oct – 30 Oct 2026". Campaign dates are whole IST days sent as YYYY-MM-DD. */
export function campaignDates(c: Pick<Campaign, 'startsAt' | 'endsAt'>): string {
  if (c.startsAt && c.endsAt) return `${fmtDay(c.startsAt)} – ${fmtDate(c.endsAt)}`;
  if (c.startsAt) return `Starts ${fmtDate(c.startsAt)}`;
  if (c.endsAt) return `Ends ${fmtDate(c.endsAt)}`;
  return 'No dates set';
}

/** Text colour of the state line (the dot uses the same colour, plus the word, never colour alone). */
export function campaignStateColor(state: CampaignState, onDark: boolean): { text: string; dot: string } {
  if (state === 'running') return onDark ? { text: '#BBF7D0', dot: '#22C55E' } : { text: '#4ADE80', dot: '#22C55E' };
  if (state === 'scheduled') return onDark ? { text: '#E6FF66', dot: '#D4FF00' } : { text: '#D4FF00', dot: '#D4FF00' };
  return onDark ? { text: '#A1A1AA', dot: '#71717A' } : { text: '#A1A1AA', dot: '#71717A' };
}
