import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  const client = createClient(data.supabase_url, data.supabase_anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { branch: data, client };
}

async function safeCount(
  client: SupabaseClient,
  table: string,
  build?: (q: any) => any,
): Promise<{ count: number | null; missing: boolean; error: string | null }> {
  try {
    let q = client.from(table).select("*", { count: "exact", head: true });
    if (build) q = build(q);
    const { count, error } = await q;
    if (error) {
      const msg = error.message || "";
      if (/does not exist|not found|schema cache/i.test(msg)) {
        return { count: null, missing: true, error: null };
      }
      return { count: null, missing: false, error: msg };
    }
    return { count: count ?? 0, missing: false, error: null };
  } catch (e) {
    return { count: null, missing: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

async function safeSum(
  client: SupabaseClient,
  table: string,
  column: string,
  build?: (q: any) => any,
): Promise<{ total: number | null; missing: boolean; error: string | null }> {
  try {
    let q = client.from(table).select(column);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) {
      const msg = error.message || "";
      if (/does not exist|not found|schema cache/i.test(msg)) {
        return { total: null, missing: true, error: null };
      }
      return { total: null, missing: false, error: msg };
    }
    const total = (data ?? []).reduce((s: number, r: any) => s + Number(r[column] ?? 0), 0);
    return { total, missing: false, error: null };
  } catch (e) {
    return { total: null, missing: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export const getBranchOverview = createServerFn({ method: "POST" })
  .inputValidator(z.object({ branchId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { branch, client } = await getBranchClient(data.branchId);

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [
      dailyRev,
      monthlyRev,
      dailyOps,
      monthlyOps,
      apptToday,
      apptUpcoming,
      customers,
      staff,
      inventoryLow,
      inventoryTotal,
    ] = await Promise.all([
      safeSum(client, "operations", "amount", (q) => q.gte("created_at", startToday)),
      safeSum(client, "operations", "amount", (q) => q.gte("created_at", startMonth)),
      safeCount(client, "operations", (q) => q.gte("created_at", startToday)),
      safeCount(client, "operations", (q) => q.gte("created_at", startMonth)),
      safeCount(client, "appointments", (q) =>
        q.gte("scheduled_at", startToday).lt("scheduled_at", endToday),
      ),
      safeCount(client, "appointments", (q) => q.gte("scheduled_at", now.toISOString())),
      safeCount(client, "customers"),
      safeCount(client, "staff", (q) => q.eq("active", true)),
      safeCount(client, "inventory", (q) => q.lte("quantity", 5)),
      safeCount(client, "inventory"),
    ]);

    // Fallback for staff: try barbers table if staff missing
    let staffResult = staff;
    if (staff.missing) {
      staffResult = await safeCount(client, "barbers", (q) => q.eq("active", true));
      if (staffResult.missing) {
        staffResult = await safeCount(client, "barbers");
      }
    }

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        cashier_url: branch.cashier_url,
        active: branch.active,
      },
      generatedAt: now.toISOString(),
      revenue: {
        daily: dailyRev.total ?? 0,
        monthly: monthlyRev.total ?? 0,
        dailyError: dailyRev.error,
        monthlyError: monthlyRev.error,
      },
      operations: {
        daily: dailyOps.count ?? 0,
        monthly: monthlyOps.count ?? 0,
      },
      appointments: {
        today: apptToday.count,
        upcoming: apptUpcoming.count,
        available: !apptToday.missing,
      },
      customers: {
        total: customers.count,
        available: !customers.missing,
      },
      staff: {
        total: staffResult.count,
        available: !staffResult.missing,
      },
      inventory: {
        lowStock: inventoryLow.count,
        total: inventoryTotal.count,
        available: !inventoryTotal.missing,
      },
    };
  });