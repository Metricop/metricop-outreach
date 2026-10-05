import { LoginButton } from "./LoginButton";

const ERRORS: Record<string, string> = {
  domen: "Pristup je dozvoljen samo nalozima sa domena metricop.com.",
  prijava: "Prijava nije uspela. Pokušajte ponovo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { greska } = await searchParams;
  const error = typeof greska === "string" ? ERRORS[greska] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Metricop Outreach</h1>
        <p className="mt-1 text-sm text-muted">Interna aplikacija. Prijavite se nalogom metricop.com.</p>
        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6">
          <LoginButton />
        </div>
      </div>
    </main>
  );
}
