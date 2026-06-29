import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only: creates clients to the OTHER two Supabase projects (cashier + booking)
// using their service role keys. Never import this file from client code.

type Source = "cashier" | "booking";

const cache: Partial<Record<Source, SupabaseClient>> = {};

function envFor(source: Source) {
  if (source === "cashier") {
    return {
      url: process.env.CASHIER_SUPABASE_URL,
      key: process.env.CASHIER_SERVICE_ROLE_KEY,
    };
  }
  return {
    url: process.env.BOOKING_SUPABASE_URL,
    key: process.env.BOOKING_SERVICE_ROLE_KEY,
  };
}

export function externalClient(source: Source): SupabaseClient {
  const existing = cache[source];
  if (existing) return existing;
  const { url, key } = envFor(source);
  if (!url || !key) {
    throw new Error(
      `Missing secrets for ${source}. Set ${source.toUpperCase()}_SUPABASE_URL and ${source.toUpperCase()}_SERVICE_ROLE_KEY.`,
    );
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  cache[source] = client;
  return client;
}

// Whitelist of readable tables per source. Add more here when needed.
export const READ_WHITELIST: Record<Source, string[]> = {
  cashier: [
    "operations",
    "invoices",
    "expenses",
    "withdrawals",
    "employee_transactions",
    "attendance",
    "services",
    "clients",
    "employees",
    "bookings",
  ],
  booking: ["bookings", "clients", "services", "employees", "appointments"],
};

export function isAllowed(source: Source, table: string): boolean {
  return READ_WHITELIST[source]?.includes(table) ?? false;
}

export type { Source };
