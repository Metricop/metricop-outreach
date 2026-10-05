// Izbor sledećeg koraka sekvence i raspored follow-upa.

const DAY_MS = 86_400_000;

/** Posle poslednjeg koraka čeka se još 7 dana na odgovor. */
export const FINAL_WAIT_DAYS = 7;

export interface Step {
  stepNo: number;
  waitDays: number;
}

export interface SequenceState {
  status: string;
  step: number; // poslednji poslati korak, 0 = ništa poslato
  nextSendAt: Date | null;
}

export type DueAction =
  | { type: "none" }
  | { type: "send"; stepNo: number }
  | { type: "finish" };

function sorted(steps: Step[]): Step[] {
  return [...steps].sort((a, b) => a.stepNo - b.stepNo);
}

/** Šta treba uraditi sa kontaktom u statusu in_sequence u ovom trenutku. */
export function dueAction(c: SequenceState, steps: Step[], now: Date): DueAction {
  if (c.status !== "in_sequence") return { type: "none" };
  if (c.nextSendAt && c.nextSendAt.getTime() > now.getTime()) return { type: "none" };
  const next = sorted(steps).find((s) => s.stepNo > c.step);
  return next ? { type: "send", stepNo: next.stepNo } : { type: "finish" };
}

/** Prvi korak za novi kontakt (null ako sekvenca nema korake). */
export function firstStep(steps: Step[]): number | null {
  const s = sorted(steps)[0];
  return s ? s.stepNo : null;
}

/** Novo stanje kontakta posle uspešno poslatog koraka. */
export function stateAfterSend(stepSent: number, steps: Step[], now: Date): SequenceState {
  const next = sorted(steps).find((s) => s.stepNo > stepSent);
  const waitDays = next ? next.waitDays : FINAL_WAIT_DAYS;
  return {
    status: "in_sequence",
    step: stepSent,
    nextSendAt: new Date(now.getTime() + waitDays * DAY_MS),
  };
}
