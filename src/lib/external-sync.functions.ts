import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SourceSchema = z.enum(["cashier", "booking"]);
const SourceWithManager = z.enum(["cashier", "booking", "manager"]);

/**
 * Read a whitelisted table from one of the external Supabase projects
 * (cashier or booking) using its service-role key.
 */
export const readExternalTable = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      source: SourceSchema,
      table: z.string().min(1).max(80),
      limit: z.number().int().min(1).max(500).default(50),
      since: z.string().optional(),
      orderBy: z.string().max(80).default("created_at"),
      ascending: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const { externalClient, isAllowed } = await import("./external-sync.server");
    if (!isAllowed(data.source, data.table)) {
      return { rows: [] as any[], error: `Table '${data.table}' not allowed for ${data.source}` };
    }
    try {
      const client = externalClient(data.source);
      let q = client.from(data.table).select("*").limit(data.limit);
      // best-effort ordering: if column doesn't exist supabase returns error — fall back below
      q = q.order(data.orderBy, { ascending: data.ascending });
      if (data.since) q = q.gte(data.orderBy, data.since);
      const { data: rows, error } = await q;
      if (error) {
        // Retry without ordering if the order column doesn't exist
        const retry = await client.from(data.table).select("*").limit(data.limit);
        if (retry.error) return { rows: [], error: retry.error.message };
        return { rows: retry.data ?? [], error: null };
      }
      return { rows: rows ?? [], error: null };
    } catch (e: any) {
      return { rows: [] as any[], error: e?.message ?? "unknown error" };
    }
  });

/** Append an entry to the manager's activity_log. */
export const logActivity = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      source: SourceWithManager,
      action: z.string().min(1).max(120),
      entity: z.string().max(80).optional().nullable(),
      entityId: z.string().max(120).optional().nullable(),
      actor: z.string().max(120).optional().nullable(),
      metadata: z.record(z.any()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("activity_log")
      .insert({
        source: data.source,
        action: data.action,
        entity: data.entity ?? null,
        entity_id: data.entityId ?? null,
        actor: data.actor ?? null,
        metadata: data.metadata ?? {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { entry: row };
  });

/** Read the manager's activity_log. */
export const listActivity = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(500).default(100),
      source: SourceWithManager.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("activity_log")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.source) q = q.eq("source", data.source);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

/**
 * Aggregate snapshot used by the Control Center UI. Pulls a handful of tables
 * from each external project in parallel and returns counts + recent rows.
 */
export const controlCenterSnapshot = createServerFn({ method: "POST" })
  .inputValidator(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
  .handler(async ({ data }) => {
    const limit = data?.limit ?? 20;
    const { externalClient, READ_WHITELIST } = await import("./external-sync.server");

    async function safeFetch(source: "cashier" | "booking", table: string) {
      if (!READ_WHITELIST[source].includes(table)) return { rows: [], error: "not allowed" };
      try {
        const client = externalClient(source);
        // Try ordering by created_at; fall back to no order
        let res = await client.from(table).select("*").order("created_at", { ascending: false }).limit(limit);
        if (res.error) res = await client.from(table).select("*").limit(limit);
        return { rows: res.data ?? [], error: res.error?.message ?? null };
      } catch (e: any) {
        return { rows: [], error: e?.message ?? "fetch failed" };
      }
    }

    const [
      cashierOps,
      cashierInvoices,
      cashierExpenses,
      cashierWithdrawals,
      cashierAttendance,
      cashierEmployees,
      cashierClients,
      bookingBookings,
      bookingClients,
    ] = await Promise.all([
      safeFetch("cashier", "operations"),
      safeFetch("cashier", "invoices"),
      safeFetch("cashier", "expenses"),
      safeFetch("cashier", "withdrawals"),
      safeFetch("cashier", "attendance"),
      safeFetch("cashier", "employees"),
      safeFetch("cashier", "clients"),
      safeFetch("booking", "bookings"),
      safeFetch("booking", "clients"),
    ]);

    return {
      cashier: {
        operations: cashierOps,
        invoices: cashierInvoices,
        expenses: cashierExpenses,
        withdrawals: cashierWithdrawals,
        attendance: cashierAttendance,
        employees: cashierEmployees,
        clients: cashierClients,
      },
      booking: {
        bookings: bookingBookings,
        clients: bookingClients,
      },
      fetchedAt: new Date().toISOString(),
    };
  });
