// Dnevni limiti i limit po krugu. Pravila su u kodu, ne u podešavanjima.

/** Tvrda gornja granica po mailboxu dnevno, bez obzira na podešavanje. */
export const HARD_DAILY_CAP = 50;

/** Prve dve nedelje posle dodavanja mailboxa važe niži limiti (zagrevanje). */
export const WARMUP_DAYS = 14;
export const WARMUP_MAX_NEW = 10;
export const WARMUP_MAX_TOTAL = 20;

export interface MailboxLimits {
  dailyLimitNew: number;
  dailyLimitTotal: number;
  perRunLimit: number;
  createdAt: Date;
}

export interface DailyCounts {
  sentNew: number;
  sentTotal: number;
}

export interface EffectiveLimits {
  maxNew: number;
  maxTotal: number;
}

export function effectiveDailyLimits(m: MailboxLimits, now: Date): EffectiveLimits {
  const ageDays = (now.getTime() - m.createdAt.getTime()) / 86_400_000;
  const inWarmup = ageDays < WARMUP_DAYS;
  let maxTotal = Math.min(Math.max(m.dailyLimitTotal, 0), HARD_DAILY_CAP);
  let maxNew = Math.min(Math.max(m.dailyLimitNew, 0), maxTotal);
  if (inWarmup) {
    maxTotal = Math.min(maxTotal, WARMUP_MAX_TOTAL);
    maxNew = Math.min(maxNew, WARMUP_MAX_NEW, maxTotal);
  }
  return { maxNew, maxTotal };
}

export interface RunPlan {
  followups: number;
  newContacts: number;
}

/**
 * Koliko mejlova sme da ode u ovom krugu. Follow-upovi imaju prednost
 * (korak 3 pre koraka 4 iz specifikacije), novi kontakti dobijaju ostatak.
 */
export function planRun(
  m: MailboxLimits,
  counts: DailyCounts,
  now: Date,
  followupsDue: number,
  newAvailable: number,
): RunPlan {
  const { maxNew, maxTotal } = effectiveDailyLimits(m, now);
  const perRun = Math.min(Math.max(m.perRunLimit, 0), HARD_DAILY_CAP);
  let budget = Math.max(0, Math.min(perRun, maxTotal - counts.sentTotal));

  const followups = Math.min(budget, Math.max(0, followupsDue));
  budget -= followups;

  const newRoom = Math.max(0, maxNew - counts.sentNew);
  const newContacts = Math.min(budget, newRoom, Math.max(0, newAvailable));

  return { followups, newContacts };
}

/** Nasumična pauza između dva mejla: 15–45 sekundi. */
export function randomPauseMs(random: () => number = Math.random): number {
  return Math.round(15_000 + random() * 30_000);
}

/** Bounce stopa iznad 3% u poslednjih 7 dana pauzira mailbox. */
export const MAX_BOUNCE_RATE = 0.03;

export function shouldPauseForBounces(sent7d: number, bounced7d: number): boolean {
  if (sent7d <= 0) return false;
  return bounced7d / sent7d > MAX_BOUNCE_RATE;
}
