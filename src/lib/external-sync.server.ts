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
  "salon_transactions",
  "salon_employees",
  "salon_clients",
  "salon_services",
  "salon_withdrawals",
  "salon_attendance",
  "salon_expenses",
  "salon_bookings",
] as const;

export function isCashierAllowed(table: string): boolean {
  return (CASHIER_WHITELIST as readonly string[]).includes(table);
}

let _cashierSalonId: string | null | undefined;
let _cashierSalonIdPromise: Promise<string> | undefined;

/**
 * The cashier project holds a single salon row. Look it up once and cache
 * the id in memory so downstream reads can scope by salon_id without any
 * hardcoded configuration.
 */
export async function getCashierSalonId(): Promise<string> {
  if (_cashierSalonId) return _cashierSalonId;
  if (_cashierSalonIdPromise) return _cashierSalonIdPromise;
  _cashierSalonIdPromise = (async () => {
    const client = cashierClient();
    const { data, error } = await client
      .from("salons")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (error) {
      _cashierSalonIdPromise = undefined;
      throw new Error(`لم يتم العثور على صالون في مشروع الكاشير: ${error.message}`);
    }
    if (!data?.id) {
      _cashierSalonIdPromise = undefined;
      throw new Error("لم يتم العثور على صالون في مشروع الكاشير: الجدول فاضي");
    }
    _cashierSalonId = data.id as string;
    return _cashierSalonId;
  })();
  return _cashierSalonIdPromise;
}