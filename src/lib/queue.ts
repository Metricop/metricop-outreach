// Procena reda čekanja: grupa sa dnevnom kvotom uključuje N kontakata svakog radnog dana.

/** Datum posle `days` radnih dana (pon–pet), računajući od sutra. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/** Kada će i poslednji kontakt iz reda dobiti prvi mejl (null ako grupa nema kvotu ili je red prazan). */
export function queueFinishDate(queued: number, dailyQuota: number | null, today: Date): Date | null {
  if (!dailyQuota || dailyQuota <= 0 || queued <= 0) return null;
  return addBusinessDays(today, Math.ceil(queued / dailyQuota));
}
