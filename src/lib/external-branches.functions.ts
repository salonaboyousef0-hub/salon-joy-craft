import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function getBranchClient(branchId: string) {
  const sb = await admin();
  const { data, error } = await sb
    .from("external_branches")
    .select("*")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Branch not found");
  if (!data.active) throw new Error("Branch is inactive");
  const client = createClient(data.supabase_url, data.supabase_anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { branch: data, client };
}

export const addExternalBranch = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(120),
      cashier_url: z.string().url().max(500).optional().nullable(),
      supabase_url: z.string().url().max(500),
      supabase_anon_key: z.string().min(20).max(4000),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: row, error } = await sb
      .from("external_branches")
      .insert({
        name: data.name,
        cashier_url: data.cashier_url ?? null,
        supabase_url: data.supabase_url,
        supabase_anon_key: data.supabase_anon_key,
        active: data.active ?? true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { branch: row };
  });

export const listExternalBranches = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb
    .from("external_branches")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { branches: data ?? [] };
});

export const updateExternalBranch = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      cashier_url: z.string().url().max(500).nullable().optional(),
      supabase_url: z.string().url().max(500).optional(),
      supabase_anon_key: z.string().min(20).max(4000).optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { id, ...patch } = data;
    const { data: row, error } = await sb
      .from("external_branches")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { branch: row };
  });

export const deleteExternalBranch = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("external_branches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBranchOperations = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      branchId: z.string().uuid(),
      since: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await getBranchClient(data.branchId);
    let q = client.from("operations").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.since) q = q.gte("created_at", data.since);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { operations: rows ?? [] };
  });

export const getBranchStats = createServerFn({ method: "POST" })
  .inputValidator(z.object({ branchId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: branches, error } = await sb
      .from("external_branches")
      .select("*")
      .eq("active", true);
    if (error) throw new Error(error.message);

    const targets = data?.branchId
      ? (branches ?? []).filter((b) => b.id === data.branchId)
      : branches ?? [];

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const perBranch = await Promise.all(
      targets.map(async (b) => {
        try {
          const client = createClient(b.supabase_url, b.supabase_anon_key, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const [todayRes, monthRes] = await Promise.all([
            client.from("operations").select("amount").gte("created_at", startToday),
            client.from("operations").select("amount").gte("created_at", startMonth),
          ]);
          const dailyRevenue = (todayRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
          const dailyOps = (todayRes.data ?? []).length;
          const monthlyRevenue = (monthRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
          return {
            branchId: b.id,
            branchName: b.name,
            cashierUrl: b.cashier_url,
            dailyRevenue,
            dailyOps,
            monthlyRevenue,
            error: todayRes.error?.message || monthRes.error?.message || null,
          };
        } catch (e) {
          return {
            branchId: b.id,
            branchName: b.name,
            cashierUrl: b.cashier_url,
            dailyRevenue: 0,
            dailyOps: 0,
            monthlyRevenue: 0,
            error: e instanceof Error ? e.message : "unknown",
          };
        }
      }),
    );

    const totals = perBranch.reduce(
      (acc, b) => ({
        dailyRevenue: acc.dailyRevenue + b.dailyRevenue,
        dailyOps: acc.dailyOps + b.dailyOps,
        monthlyRevenue: acc.monthlyRevenue + b.monthlyRevenue,
      }),
      { dailyRevenue: 0, dailyOps: 0, monthlyRevenue: 0 },
    );

    return { branches: perBranch, totals };
  });

const OperationPayload = z.object({
  service: z.string().min(1).max(120),
  amount: z.number().nonnegative().max(1000000),
  barber: z.string().min(1).max(80),
  assistant: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  source: z.string().max(20).optional(),
  branch: z.string().max(120).optional(),
});

export const createBranchOperation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ branchId: z.string().uuid(), operation: OperationPayload }))
  .handler(async ({ data }) => {
    const { client, branch } = await getBranchClient(data.branchId);
    const { data: row, error } = await client
      .from("operations")
      .insert({
        service: data.operation.service,
        amount: data.operation.amount,
        barber: data.operation.barber,
        assistant: data.operation.assistant ?? null,
        notes: data.operation.notes ?? null,
        source: data.operation.source ?? "manager",
        branch: data.operation.branch ?? branch.name,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { operation: row };
  });

export const updateBranchOperation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      branchId: z.string().uuid(),
      id: z.string().uuid(),
      patch: OperationPayload.partial(),
    }),
  )
  .handler(async ({ data }) => {
    const { client } = await getBranchClient(data.branchId);
    const { data: row, error } = await client
      .from("operations")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { operation: row };
  });

export const deleteBranchOperation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ branchId: z.string().uuid(), id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { client } = await getBranchClient(data.branchId);
    const { error } = await client.from("operations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testBranchConnection = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      supabase_url: z.string().url().max(500).optional(),
      supabase_anon_key: z.string().min(20).max(4000).optional(),
      branchId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    let url = data.supabase_url;
    let key = data.supabase_anon_key;
    if (data.branchId) {
      const sb = await admin();
      const { data: row, error } = await sb
        .from("external_branches")
        .select("supabase_url, supabase_anon_key")
        .eq("id", data.branchId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!row) return { ok: false, error: "Branch not found" };
      url = row.supabase_url;
      key = row.supabase_anon_key;
    }
    if (!url || !key) return { ok: false, error: "Missing credentials" };
    try {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error, count } = await client
        .from("operations")
        .select("*", { count: "exact", head: true });
      if (error) return { ok: false, error: error.message };
      return { ok: true, count: count ?? 0 };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  });