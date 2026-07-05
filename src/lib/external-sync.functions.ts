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
      limit: z.number().int().min(1).max(5000).default(50),
      since: z.string().optional(),
      orderBy: z.string().max(80).default("created_at"),
      ascending: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    try {
      let client: any;
      let scopedSalonId: string | null = null;
      if (data.source === "cashier") {
        const { cashierClient, isCashierAllowed, getCashierSalonId } = await import("./external-sync.server");
        if (!isCashierAllowed(data.table)) {
          return { rows: [] as any[], error: `Table '${data.table}' not allowed for cashier` };
        }
        client = cashierClient();
        try {
          scopedSalonId = await getCashierSalonId();
        } catch (e: any) {
          const msg = e?.message ?? "cashier salon_id unavailable";
          console.error("[external-sync] cashier salon_id lookup failed:", msg);
          return { rows: [] as any[], error: msg };
        }
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
      if (data.source === "cashier") {
        if (scopedSalonId) q = q.eq("salon_id", scopedSalonId);
        q = q.is("deleted_at", null);
      }
      const { data: rows, error } = await q;
      if (error) {
        console.error(
          `[external-sync] read failed source=${data.source} table=${data.table}: ${error.message}`,
        );
        return { rows: [], error: error.message };
      }
      const normalized =
        data.source === "cashier"
          ? (rows ?? []).map((r: any) => ({
              id: r.id,
              created_at: r.created_at,
              updated_at: r.updated_at,
              ...(r.data && typeof r.data === "object" ? r.data : {}),
            }))
          : (rows ?? []);
      return { rows: normalized, error: null };
    } catch (e: any) {
      const msg = e?.message ?? "unknown error";
      console.error(`[external-sync] unexpected error source=${data.source} table=${data.table}:`, msg);
      return { rows: [] as any[], error: msg };
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
    const { cashierClient, getCashierSalonId } = await import("./external-sync.server");
    let cashier: any = null;
    let cashierError: string | null = null;
    let cashierSalonId: string | null = null;
    try {
      cashier = cashierClient();
    } catch (e: any) {
      cashierError = e?.message ?? "cashier client unavailable";
      console.error("[external-sync] cashier client init failed:", cashierError);
    }
    if (cashier) {
      try {
        cashierSalonId = await getCashierSalonId();
      } catch (e: any) {
        cashierError = e?.message ?? "cashier salon_id unavailable";
        console.error("[external-sync] cashier salon_id lookup failed:", cashierError);
        cashier = null;
      }
    }

    async function safeFetch(client: any, table: string, fallbackError: string | null = null) {
      if (!client) return { rows: [] as any[], error: fallbackError ?? "client unavailable" };
      try {
        let q = client
          .from(table)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (client === cashier) {
          if (cashierSalonId) q = q.eq("salon_id", cashierSalonId);
          q = q.is("deleted_at", null);
        }
        const res = await q;
        if (res.error) {
          console.error(`[external-sync] snapshot fetch ${table} failed: ${res.error.message}`);
          return { rows: [], error: res.error.message };
        }
        const rows =
          client === cashier
            ? (res.data ?? []).map((r: any) => ({
                id: r.id,
                created_at: r.created_at,
                updated_at: r.updated_at,
                ...(r.data && typeof r.data === "object" ? r.data : {}),
              }))
            : (res.data ?? []);
        return { rows, error: null };
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
      safeFetch(cashier, "salon_transactions", cashierError),
      Promise.resolve({ rows: [], error: null }),
      safeFetch(cashier, "salon_expenses", cashierError),
      safeFetch(cashier, "salon_withdrawals", cashierError),
      safeFetch(cashier, "salon_attendance", cashierError),
      safeFetch(cashier, "salon_employees", cashierError),
      safeFetch(cashier, "salon_clients", cashierError),
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
