/** Link na nit u Gmailu, otvara se u nalogu mailboxa. */
export function gmailThreadUrl(mailboxEmail: string | null, threadId: string | null): string | null {
  if (!threadId) return null;
  const account = mailboxEmail ? encodeURIComponent(mailboxEmail) : "0";
  return `https://mail.google.com/mail/u/${account}/#all/${threadId}`;
}
