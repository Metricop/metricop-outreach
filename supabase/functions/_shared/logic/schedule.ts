// Radno vreme slanja: pon–pet, od send_hour_from do send_hour_to, u zoni mailboxa.

export interface SendWindow {
  timezone: string;
  sendHourFrom: number;
  sendHourTo: number;
}

interface LocalParts {
  weekday: number; // 1 = ponedeljak … 7 = nedelja
  hour: number;
  date: string; // YYYY-MM-DD
}

const WEEKDAYS: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export function localParts(now: Date, timezone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    weekday: WEEKDAYS[parts.weekday],
    hour: Number(parts.hour),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Lokalni datum mailboxa, za brojanje dnevnih limita. */
export function localDate(now: Date, timezone: string): string {
  return localParts(now, timezone).date;
}

export function isWithinSendWindow(now: Date, w: SendWindow): boolean {
  const { weekday, hour } = localParts(now, w.timezone);
  if (weekday > 5) return false;
  return hour >= w.sendHourFrom && hour < w.sendHourTo;
}
