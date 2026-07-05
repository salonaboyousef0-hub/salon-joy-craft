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
  const { cashierClient, getCashierSalonId } = await import("./external-sync.server");
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const branch = data?.branch;

  let client;
  let salonId: string;
  try {
    client = cashierClient();
    salonId = await getCashierSalonId();
  } catch (e: any) {
    console.error("[getStats] cashier bridge unavailable:", e?.message ?? e);
    throw new Error(e?.message ?? "cashier bridge unavailable");
  }

  const { data: rows, error } = await client
    .from("salon_transactions")
    .select("id, data, created_at")
    .eq("salon_id", salonId)
    .is("deleted_at", null)
    .gte("created_at", startMonth.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[getStats] salon_transactions read failed:", error.message);
    throw new Error(error.message);
  }

  const flat = (rows ?? []).map((r: any) => {
    const d = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
    return {
      created_at: r.created_at as string,
      amount: Number(d.amount ?? d.total ?? d.price ?? 0),
      barber: String(d.barber ?? d.employee ?? d.employee_name ?? "غير محدد"),
      branch: (d.branch ?? d.branch_name ?? null) as string | null,
    };
  });

  const scoped = branch ? flat.filter((r) => r.branch === branch) : flat;
  const startTodayIso = startToday.toISOString();
  const today = scoped.filter((r) => r.created_at >= startTodayIso);

  const dailyRevenue = today.reduce((s, r) => s + r.amount, 0);
  const dailyOps = today.length;
  const monthlyRevenue = scoped.reduce((s, r) => s + r.amount, 0);

  const perBarberMonth: Record<string, { revenue: number; clients: number }> = {};
  for (const r of scoped) {
    const key = r.barber;
    perBarberMonth[key] = perBarberMonth[key] ?? { revenue: 0, clients: 0 };
    perBarberMonth[key].revenue += r.amount;
    perBarberMonth[key].clients += 1;
  }
  const perBranchMonth: Record<string, number> = {};
  for (const r of scoped) {
    const key = r.branch ?? "غير محدد";
    perBranchMonth[key] = (perBranchMonth[key] ?? 0) + r.amount;
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