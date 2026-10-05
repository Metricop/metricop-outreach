import { describe, expect, it } from "vitest";
import { dueAction, firstStep, stateAfterSend } from "../../supabase/functions/_shared/logic/sequence.ts";

const steps = [
  { stepNo: 1, waitDays: 0 },
  { stepNo: 2, waitDays: 3 },
  { stepNo: 3, waitDays: 5 },
];
const now = new Date("2026-10-06T08:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("stateAfterSend", () => {
  it("posle koraka N čeka wait_days sledećeg koraka", () => {
    expect(stateAfterSend(1, steps, now)).toEqual({ status: "in_sequence", step: 1, nextSendAt: days(3) });
    expect(stateAfterSend(2, steps, now).nextSendAt).toEqual(days(5));
  });
  it("posle poslednjeg koraka čeka još 7 dana", () => {
    expect(stateAfterSend(3, steps, now)).toEqual({ status: "in_sequence", step: 3, nextSendAt: days(7) });
  });
});

describe("dueAction", () => {
  it("šalje sledeći korak kad je vreme prošlo", () => {
    expect(dueAction({ status: "in_sequence", step: 1, nextSendAt: days(-1) }, steps, now)).toEqual({
      type: "send",
      stepNo: 2,
    });
  });
  it("ne radi ništa pre vremena", () => {
    expect(dueAction({ status: "in_sequence", step: 1, nextSendAt: days(1) }, steps, now)).toEqual({
      type: "none",
    });
  });
  it("posle poslednjeg koraka i čekanja završava bez odgovora", () => {
    expect(dueAction({ status: "in_sequence", step: 3, nextSendAt: days(-1) }, steps, now)).toEqual({
      type: "finish",
    });
  });
  it("ne dira kontakte koji nisu u sekvenci", () => {
    for (const status of ["new", "replied", "bounced", "paused", "unsubscribed"]) {
      expect(dueAction({ status, step: 1, nextSendAt: days(-1) }, steps, now)).toEqual({ type: "none" });
    }
  });
  it("radi i kad koraci nisu poređani", () => {
    const shuffled = [steps[2], steps[0], steps[1]];
    expect(dueAction({ status: "in_sequence", step: 1, nextSendAt: days(-1) }, shuffled, now)).toEqual({
      type: "send",
      stepNo: 2,
    });
  });
});

describe("firstStep", () => {
  it("prvi korak ili null ako nema koraka", () => {
    expect(firstStep(steps)).toBe(1);
    expect(firstStep([])).toBeNull();
  });
});
