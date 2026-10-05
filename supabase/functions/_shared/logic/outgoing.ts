// Odluka kako izgleda jedan odlazni mejl iz automatskog kruga:
// kome ide (test mod), koji korak, u kojoj niti i sa kojim zaglavljima.

import { composeEmail, type ComposedEmail } from "./compose.ts";

export interface OutgoingMailbox {
  email: string;
  alias_email: string | null;
  display_name: string | null;
  signature: string | null;
  test_mode: boolean;
  test_email: string | null;
}

export interface OutgoingContact {
  email: string;
  first_name: string | null;
  company: string | null;
  city: string | null;
  personalization: string | null;
  gmail_thread_id: string | null;
  last_message_id: string | null;
}

export interface OutgoingStep {
  step_no: number;
  subject: string | null;
  body: string;
}

export interface Outgoing extends ComposedEmail {
  stepNo: number;
  fromEmail: string;
  fromName: string | null;
  to: string;
  threadId: string | null;
  inReplyTo: string | null;
  references: string | null;
}

export function prepareOutgoing(
  mailbox: OutgoingMailbox,
  contact: OutgoingContact,
  steps: OutgoingStep[],
  stepNo: number,
): Outgoing {
  const sorted = [...steps].sort((a, b) => a.step_no - b.step_no);
  const step = sorted.find((s) => s.step_no === stepNo);
  if (!step) throw new Error(`Korak ${stepNo} ne postoji u sekvenci.`);
  if (mailbox.test_mode && !mailbox.test_email) throw new Error("Test mod je uključen, a test adresa nije podešena.");

  const email = composeEmail({
    stepNo,
    subject: step.subject,
    body: step.body,
    firstSubject: sorted[0]?.subject ?? null,
    vars: {
      ime: contact.first_name,
      firma: contact.company,
      grad: contact.city,
      personalizacija: contact.personalization,
    },
    signature: mailbox.signature,
    testMode: mailbox.test_mode,
  });

  // Korak 1 je nova poruka; koraci 2+ idu u istu nit, kao odgovor na prethodnu poruku.
  const followUp = stepNo > sorted[0].step_no && !!contact.gmail_thread_id;
  return {
    ...email,
    stepNo,
    fromEmail: mailbox.alias_email || mailbox.email,
    fromName: mailbox.display_name,
    to: mailbox.test_mode ? mailbox.test_email! : contact.email,
    threadId: followUp ? contact.gmail_thread_id : null,
    inReplyTo: followUp ? contact.last_message_id : null,
    references: followUp ? contact.last_message_id : null,
  };
}
