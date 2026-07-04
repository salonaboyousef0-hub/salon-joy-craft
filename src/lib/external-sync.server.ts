import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only: creates a client to the external Cashier Supabase project
// using its service-role key. Never import from client code.

let _cashier: SupabaseClient | undefined;

export function cashierClient(): SupabaseClient {
  if (_cashier) return _cashier;
  const url = process.env.CASHIER_SUPABASE_URL;
  const key = process.env.CASHIER_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing CASHIER_SUPABASE_URL or CASHIER_SERVICE_ROLE_KEY.");
  }
  _cashier = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  return _cashier;
}

export const CASHIER_WHITELIST = [
  "operations",
  "invoices",
  "expenses",
  "withdrawals",
  "attendance",
  "employees",
  "clients",
  "services",
  "bookings",
] as const;

export function isCashierAllowed(table: string): boolean {
  return (CASHIER_WHITELIST as readonly string[]).includes(table);
}