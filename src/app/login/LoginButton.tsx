"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "metricop.com", prompt: "select_account" },
      },
    });
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={loading}
      className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {loading ? "Preusmeravanje…" : "Prijavi se preko Google-a"}
    </button>
  );
}
