// Javna stranica sa pravilima privatnosti; Google je traži za OAuth aplikaciju "In production".

export const metadata = { title: "Privacy policy · Metricop Outreach" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6">
      <h1 className="text-xl font-semibold">Privacy policy</h1>
      <p className="mt-1 text-muted">Metricop Outreach · Metricop d.o.o., Niš, Serbia</p>

      <h2 className="mt-8 font-semibold">What this app is</h2>
      <p className="mt-2">
        Metricop Outreach is an internal tool used only by Metricop employees to send business emails from the
        company&apos;s own Google Workspace mailboxes and to track replies.
      </p>

      <h2 className="mt-8 font-semibold">Google user data we access</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Send email</strong> (gmail.send): to send messages that a Metricop employee prepared in the app.
        </li>
        <li>
          <strong>Read email</strong> (gmail.readonly): to detect replies, bounces and unsubscribe requests in threads
          the app started.
        </li>
        <li>
          <strong>Labels</strong> (gmail.labels): to organize threads the app started.
        </li>
        <li>
          <strong>Basic profile</strong> (email address): to confirm which mailbox was connected and to let Metricop
          employees sign in.
        </li>
      </ul>

      <h2 className="mt-8 font-semibold">How the data is used and stored</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Data is used only to run the outreach features described above.</li>
        <li>Access tokens are stored encrypted and are never shown to users.</li>
        <li>Google user data is not sold, shared with third parties, or used for advertising.</li>
        <li>
          The app&apos;s use of information received from Google APIs adheres to the Google API Services User Data
          Policy, including the Limited Use requirements.
        </li>
      </ul>

      <h2 className="mt-8 font-semibold">Removing access</h2>
      <p className="mt-2">
        A connected mailbox can be disconnected at any time at myaccount.google.com/permissions, or by asking us to
        delete it.
      </p>

      <h2 className="mt-8 font-semibold">Contact</h2>
      <p className="mt-2">info@metricop.com</p>
    </main>
  );
}
