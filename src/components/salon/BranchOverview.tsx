import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  DollarSign,
  CalendarDays,
  Users,
  UserCog,
  Package,
  AlertTriangle,
  Receipt,
  ExternalLink,
  Loader2,
} from "lucide-react";

import { listExternalBranches } from "@/lib/external-branches.functions";
import { getBranchOverview } from "@/lib/branch-overview.functions";

type Branch = {
  id: string;
  name: string;
  cashier_url: string | null;
  active: boolean;
};

type Overview = Awaited<ReturnType<typeof getBranchOverview>>;

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(n);
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const toneCls =
    tone === "warn"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "good"
        ? "border-emerald-500/40 bg-emerald-500/5"
        : "border-border bg-card";
  return (
    <div className={`rounded-2xl border ${toneCls} p-4`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-semibold">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function BranchOverview() {
  const list = useServerFn(listExternalBranches);
  const fetchOverview = useServerFn(getBranchOverview);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    list().then((r) => {
      const bs = r.branches as Branch[];
      setBranches(bs);
      if (bs.length && !selected) setSelected(bs[0].id);
    }).catch((e) => setError(e instanceof Error ? e.message : "خطأ"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchOverview({ data: { branchId: id } });
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر جلب البيانات");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fetchOverview]);

  useEffect(() => { if (selected) load(selected); }, [selected, load]);

  // Live refresh every 20s
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => load(selected), 20000);
    return () => clearInterval(t);
  }, [selected, load]);

  return (
    <section className="space-y-4" dir="rtl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">نظرة عامة على الفرع</h1>
          <p className="text-xs text-muted-foreground">إحصائيات مباشرة من قاعدة بيانات الفرع</p>
        </div>
        <button
          onClick={() => selected && load(selected)}
          disabled={!selected || loading}
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </button>
      </header>

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          لا يوجد فروع متصلة. أضف فرعًا من تبويب «الفروع».
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => {
              const active = selected === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-[var(--gold)] bg-[var(--gold)]/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b.name}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {data ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard icon={DollarSign} label="إيراد اليوم" value={fmtMoney(data.revenue.daily)} hint={`${data.operations.daily} عملية`} tone="good" />
                <StatCard icon={DollarSign} label="إيراد الشهر" value={fmtMoney(data.revenue.monthly)} hint={`${data.operations.monthly} عملية`} />
                <StatCard
                  icon={CalendarDays}
                  label="مواعيد اليوم"
                  value={data.appointments.available ? String(data.appointments.today ?? 0) : "—"}
                  hint={data.appointments.available ? `${data.appointments.upcoming ?? 0} قادمة` : "جدول المواعيد غير متوفر"}
                />
                <StatCard
                  icon={Users}
                  label="العملاء"
                  value={data.customers.available ? String(data.customers.total ?? 0) : "—"}
                  hint={data.customers.available ? "إجمالي العملاء" : "جدول العملاء غير متوفر"}
                />
                <StatCard
                  icon={UserCog}
                  label="الموظفون"
                  value={data.staff.available ? String(data.staff.total ?? 0) : "—"}
                  hint={data.staff.available ? "نشطون" : "جدول الموظفين غير متوفر"}
                />
                <StatCard
                  icon={data.inventory.available && (data.inventory.lowStock ?? 0) > 0 ? AlertTriangle : Package}
                  label="تنبيهات المخزون"
                  value={data.inventory.available ? String(data.inventory.lowStock ?? 0) : "—"}
                  hint={
                    data.inventory.available
                      ? `${data.inventory.total ?? 0} صنف`
                      : "جدول المخزون غير متوفر"
                  }
                  tone={data.inventory.available && (data.inventory.lowStock ?? 0) > 0 ? "warn" : "default"}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
                <span>آخر تحديث: {new Date(data.generatedAt).toLocaleTimeString("ar-SA")}</span>
                {data.branch.cashier_url ? (
                  <a
                    href={data.branch.cashier_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:text-[var(--gold)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    فتح كاشير {data.branch.name}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1"><Receipt className="h-3.5 w-3.5" />لا يوجد رابط كاشير</span>
                )}
              </div>

              {data.revenue.dailyError || data.revenue.monthlyError ? (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  {data.revenue.dailyError || data.revenue.monthlyError}
                </div>
              ) : null}
            </>
          ) : loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}