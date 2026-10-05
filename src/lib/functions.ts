import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Poziv Supabase Edge funkcije; vraća poruku greške na srpskom iz odgovora funkcije. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Greška na serveru.");
    }
    throw new Error(error.message);
  }
  return data as T;
}
