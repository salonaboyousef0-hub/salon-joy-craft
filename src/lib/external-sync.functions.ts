import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SourceWithManager = z.enum(["cashier", "booking", "manager"]);

// Cashier data lives in an external Supabase project (via CASHIER_SUPABASE_URL
// + CASHIER_SERVICE_ROLE_KEY). Booking data still lives in Lovable Cloud.
const LOCAL_WHITELIST = [
  "bookings",
  "clients",
  "employees",
  "services",
] as const;

/**
 * Read a whitelisted table. `source: "cashier"` hits the external project,
 * anything else reads from the local Lovable Cloud database.
 */
export const readExternalTable = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      source: SourceWithManager,
      table: z.string().min(1).max(80),
      limit: z.number().int().min(1).max(500).default(50),
      since: z.string().optional(),
      orderBy: z.string().max(80).default("created_at"),
      ascending: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    try {
      let client: any;
      if (data.source === "cashier") {
        const { cashierClient, isCashierAllowed } = await import("./external-sync.server");
        if (!isCashierAllowed(data.table)) {
          return { rows: [] as any[], error: `Table '${data.table}' not allowed for cashier` };
        }
        client = cashierClient();
      } else {
        if (!(LOCAL_WHITELIST as readonly string[]).includes(data.table)) {
          return { rows: [] as any[], error: `Table '${data.table}' not allowed` };
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        client = supabaseAdmin;
      }
      let q = client.from(data.table).select("*").limit(data.limit);
      q = q.order(data.orderBy, { ascending: data.ascending });
      if (data.since) q = q.gte(data.orderBy, data.since);
      const { data: rows, error } = await q;
      if (error) {
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cashierClient } = await import("./external-sync.server");
    let cashier: any = null;
    let cashierError: string | null = null;
    try {
      cashier = cashierClient();
    } catch (e: any) {
      cashierError = e?.message ?? "cashier client unavailable";
    }

    async function safeFetch(client: any, table: string, fallbackError: string | null = null) {
      if (!client) return { rows: [] as any[], error: fallbackError ?? "client unavailable" };
      try {
        let res = await client
          .from(table)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
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
      safeFetch(cashier, "operations", cashierError),
      safeFetch(cashier, "invoices", cashierError),
      safeFetch(cashier, "expenses", cashierError),
      safeFetch(cashier, "withdrawals", cashierError),
      safeFetch(cashier, "attendance", cashierError),
      safeFetch(cashier, "employees", cashierError),
      safeFetch(cashier, "clients", cashierError),
      safeFetch(supabaseAdmin, "bookings"),
      safeFetch(supabaseAdmin, "clients"),
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
