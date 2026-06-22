import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

type Fn<T> = (args?: { data?: any }) => Promise<T>;

/**
 * Subscribe to a public-schema table for realtime invalidation
 * of the given queryKey.
 */
export function useRealtimeInvalidate(table: string, queryKey: any[]) {
  const qc = useQueryClient();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keyStr = JSON.stringify(queryKey);
  useEffect(() => {
    const channel = supabase
      .channel(`rt-${table}-${keyStr}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, keyStr]);
}

/**
 * Generic salon list query with realtime invalidation.
 */
export function useSalonList<T>(
  table: string,
  queryKey: any[],
  serverFn: any,
  args: Record<string, unknown> = {},
) {
  const fn = useServerFn(serverFn) as Fn<T>;
  const q = useQuery<T>({
    queryKey,
    queryFn: () => fn({ data: args }),
  });
  useRealtimeInvalidate(table, queryKey);
  return q;
}

/** Helper: invalidate one or more query keys after a mutation */
export function useInvalidator() {
  const qc = useQueryClient();
  return (keys: any[][]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

/** Current ISO week start (Saturday) — matches Arabic week convention */
export function currentWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 1) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** Today's ISO date (YYYY-MM-DD) */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** This month's first day (YYYY-MM-01) */
export function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}