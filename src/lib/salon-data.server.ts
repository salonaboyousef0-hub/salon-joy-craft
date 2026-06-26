import { createMiddleware } from "@tanstack/react-start";

// Internal app — no auth. Inject the service-role client and a default salon id.
export const withSalonContext = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return next({ context: { supabase: supabaseAdmin as any, userId: null as unknown as string } });
});

// Resolve a default salon — first row in `salons`. App is single-tenant internal use.
export async function resolveSalonId(supabase: any, _userId: unknown, override?: string) {
  if (override) return override;
  const { data, error } = await (supabase as any)
    .from("salons")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("No salon found. Create a salon row first.");
  return data.id as string;
}