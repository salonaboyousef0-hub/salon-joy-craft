import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Activity, Receipt, CalendarDays, Users, Wallet, Clock, AlertTriangle } from "lucide-react";

import { controlCenterSnapshot, listActivity } from "@/lib/external-sync.functions";

function Section({
  title,
  icon,
  count,
  error,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  error: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
        <div className="text-xs gold-text font-bold">{count}</div>
      </div>
      {error ? (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-red-400">
          <AlertTriangle className="h-3 w-3" /> {error}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function RowList({ rows, fields }: { rows: any[]; fields: string[] }) {
  if (!rows?.length) return <div className="mt-2 text-[11px] text-muted-foreground">لا توجد بيانات</div>;
  return (
    <ul className="mt-2 space-y-1 text-[11px] text-foreground/85">
      {rows.slice(0, 5).map((r, i) => (
        <li key={r.id ?? i} className="truncate">
          {fields.map((f) => r[f]).filter(Boolean).join(" · ") || JSON.stringify(r).slice(0, 80)}
        </li>
      ))}
    </ul>
  );
}

export function ControlCenter() {
  const snapshotFn = useServerFn(controlCenterSnapshot);
  const activityFn = useServerFn(listActivity);

  const snap = useQuery({
    queryKey: ["control-center", "snapshot"],
    queryFn: () => snapshotFn({ data: { limit: 20 } }),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });

  const activity = useQuery({
    queryKey: ["control-center", "activity"],
    queryFn: () => activityFn({ data: { limit: 50 } }),
    refetchInterval: 8000,
  });

  const data = snap.data;
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("ar-EG") : "—";

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-gradient-to-br from-card to-background p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">مركز التحكم</h1>
            <p className="text-xs text-muted-foreground">
              قراءة مباشرة من تطبيقات الكاشير والحجز · يحدّث كل 8 ثواني · آخر تحديث: {fetchedAt}
            </p>
          </div>
          <button
            onClick={() => {
              snap.refetch();
              activity.refetch();
            }}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary"
          >
            <RefreshCw className={`h-3 w-3 ${snap.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">من الكاشير</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Section
            title="عمليات البيع"
            icon={<Receipt className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.operations.rows.length ?? 0}
            error={data?.cashier.operations.error ?? null}
          >
            <RowList rows={data?.cashier.operations.rows ?? []} fields={["service", "amount", "barber", "branch"]} />
          </Section>
          <Section
            title="الفواتير"
            icon={<Receipt className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.invoices.rows.length ?? 0}
            error={data?.cashier.invoices.error ?? null}
          >
            <RowList rows={data?.cashier.invoices.rows ?? []} fields={["invoice_number", "total", "client_name"]} />
          </Section>
          <Section
            title="المصروفات"
            icon={<Wallet className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.expenses.rows.length ?? 0}
            error={data?.cashier.expenses.error ?? null}
          >
            <RowList rows={data?.cashier.expenses.rows ?? []} fields={["category", "amount", "note"]} />
          </Section>
          <Section
            title="السحب والإيداع"
            icon={<Wallet className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.withdrawals.rows.length ?? 0}
            error={data?.cashier.withdrawals.error ?? null}
          >
            <RowList rows={data?.cashier.withdrawals.rows ?? []} fields={["type", "amount", "employee", "note"]} />
          </Section>
          <Section
            title="الحضور والانصراف"
            icon={<Clock className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.attendance.rows.length ?? 0}
            error={data?.cashier.attendance.error ?? null}
          >
            <RowList rows={data?.cashier.attendance.rows ?? []} fields={["employee", "check_in", "check_out"]} />
          </Section>
          <Section
            title="الموظفين"
            icon={<Users className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.employees.rows.length ?? 0}
            error={data?.cashier.employees.error ?? null}
          >
            <RowList rows={data?.cashier.employees.rows ?? []} fields={["name", "role", "phone"]} />
          </Section>
          <Section
            title="العملاء (كاشير)"
            icon={<Users className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.cashier.clients.rows.length ?? 0}
            error={data?.cashier.clients.error ?? null}
          >
            <RowList rows={data?.cashier.clients.rows ?? []} fields={["name", "phone"]} />
          </Section>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">من الحجز</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Section
            title="الحجوزات"
            icon={<CalendarDays className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.booking.bookings.rows.length ?? 0}
            error={data?.booking.bookings.error ?? null}
          >
            <RowList rows={data?.booking.bookings.rows ?? []} fields={["client_name", "service", "start_time", "status"]} />
          </Section>
          <Section
            title="العملاء (حجز)"
            icon={<Users className="h-4 w-4" style={{ color: "var(--gold)" }} />}
            count={data?.booking.clients.rows.length ?? 0}
            error={data?.booking.clients.error ?? null}
          >
            <RowList rows={data?.booking.clients.rows ?? []} fields={["name", "phone"]} />
          </Section>
        </div>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Activity className="h-4 w-4" /> سجل النشاطات (Activity Log)
        </h2>
        <div className="rounded-2xl border border-border bg-card">
          {(activity.data?.entries ?? []).length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">لا توجد نشاطات بعد</div>
          ) : (
            <ul className="divide-y divide-border">
              {(activity.data?.entries ?? []).map((e: any) => (
                <li key={e.id} className="flex items-center justify-between gap-3 p-3 text-xs">
                  <div className="flex flex-1 items-center gap-2 truncate">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase">
                      {e.source}
                    </span>
                    <span className="font-semibold">{e.action}</span>
                    {e.entity ? <span className="text-muted-foreground">· {e.entity}</span> : null}
                    {e.actor ? <span className="text-muted-foreground">· {e.actor}</span> : null}
                  </div>
                  <div className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(e.occurred_at).toLocaleString("ar-EG")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
