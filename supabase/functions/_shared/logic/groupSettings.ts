// Posebna podešavanja grupe: potpis i radno vreme koji važe samo za tu grupu.
// Prazno polje znači "kao mailbox", pa jedan Gmail nalog može da šalje
// npr. srpsku grupu po beogradskom vremenu i američku po američkom.

import type { SendWindow } from "./schedule.ts";

export interface MailboxDefaults {
  signature: string | null;
  timezone: string;
  send_hour_from: number;
  send_hour_to: number;
}

export interface GroupOverrides {
  signature?: string | null;
  timezone?: string | null;
  send_hour_from?: number | null;
  send_hour_to?: number | null;
  pause_from?: string | null;
  pause_to?: string | null;
}

/** Potpis koji ide ispod mejlova iz grupe: potpis grupe, a ako ga nema, potpis mailboxa. */
export function effectiveSignature(mailbox: MailboxDefaults, group?: GroupOverrides | null): string | null {
  const own = group?.signature?.trim();
  return own ? own : mailbox.signature;
}

/** Radno vreme grupe: svako polje grupe koje je popunjeno zamenjuje isto polje mailboxa. */
export function effectiveSendWindow(mailbox: MailboxDefaults, group?: GroupOverrides | null): SendWindow {
  return {
    timezone: group?.timezone || mailbox.timezone,
    sendHourFrom: group?.send_hour_from ?? mailbox.send_hour_from,
    sendHourTo: group?.send_hour_to ?? mailbox.send_hour_to,
    pauseFrom: group?.pause_from ?? null,
    pauseTo: group?.pause_to ?? null,
  };
}
