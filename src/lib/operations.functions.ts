import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const OperationInput = z.object({
  service: z.string().min(1).max(120),
  amount: z.number().nonnegative().max(1000000),
  barber: z.string().min(1).max(80),
  assistant: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  source: z.string().max(20).optional(),
  branch: z.string().min(1).max(120).optional(),
});

export type OperationInputType = z.infer<typeof OperationInput>;

export const addOperation = createServerFn({ method: "POST" })
  .inputValidator(OperationInput)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("operations")
      .insert({
        service: data.service,
        amount: data.amount,
        barber: data.barber,
        assistant: data.assistant ?? null,
        notes: data.notes ?? null,
        source: data.source ?? "manual",
        ...(data.branch ? { branch: data.branch } : {}),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { operation: row };
  });

export const listOperations = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      since: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      branch: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("operations").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.since) q = q.gte("created_at", data.since);
    if (data.branch) q = q.eq("branch", data.branch);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { operations: rows ?? [] };
  });

export const deleteOperation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("operations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getStats = createServerFn({ method: "POST" })
  .inputValidator(z.object({ branch: z.string().max(120).optional() }).optional())
  .handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const branch = data?.branch;

  const baseToday = supabaseAdmin.from("operations").select("amount, barber, branch").gte("created_at", startToday);
  const baseMonth = supabaseAdmin.from("operations").select("amount, barber, branch").gte("created_at", startMonth);
  const [todayRes, monthRes] = await Promise.all([
    branch ? baseToday.eq("branch", branch) : baseToday,
    branch ? baseMonth.eq("branch", branch) : baseMonth,
  ]);

  if (todayRes.error) throw new Error(todayRes.error.message);
  if (monthRes.error) throw new Error(monthRes.error.message);

  const dailyRevenue = (todayRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const dailyOps = (todayRes.data ?? []).length;
  const monthlyRevenue = (monthRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const perBarberMonth: Record<string, { revenue: number; clients: number }> = {};
  for (const r of monthRes.data ?? []) {
    const key = r.barber;
    perBarberMonth[key] = perBarberMonth[key] ?? { revenue: 0, clients: 0 };
    perBarberMonth[key].revenue += Number(r.amount);
    perBarberMonth[key].clients += 1;
  }

  const perBranchMonth: Record<string, number> = {};
  for (const r of monthRes.data ?? []) {
    perBranchMonth[r.branch] = (perBranchMonth[r.branch] ?? 0) + Number(r.amount);
  }

  return {
    dailyRevenue,
    dailyOps,
    monthlyRevenue,
    perBarberMonth,
    perBranchMonth,
    branch: branch ?? null,
  };
});