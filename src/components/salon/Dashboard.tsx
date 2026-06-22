import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, RefreshCw, NotebookPen, ListPlus, FileText, Receipt } from "lucide-react";

import { askManager } from "@/lib/manager-ai.functions";
import { getStats } from "@/lib/operations.functions";
import { getSalonStats, upsertSalonStat } from "@/lib/salon-data.functions";
import { useSalonList, useInvalidator, todayISO } from "./useSalonData";
import { supabase } from "@/integrations/supabase/client";
import { BranchSwitcher, useActiveBranch } from "./BranchSwitcher";

function StatCard({
  label,
  value,
  onChange,
  readOnly,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_0_0_1px_var(--border)]">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        {hint ? <div className="text-[9px] text-[var(--gold)]">{hint}</div> : null}
      </div>
      {readOnly ? (
        <div className="mt-2 text-2xl font-bold gold-text">{value || "0"}</div>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="mt-2 w-full bg-transparent text-2xl font-bold gold-text outline-none"
          inputMode="numeric"
          placeholder="0"
        />
      )}
      <div className="mt-1 text-[10px] text-muted-foreground">{label.includes("عمليات") ? "" : "جنيه"}</div>
    </div>
  );
}

export function Dashboard({
  onGoChat,
  onGoTasks,
  onGoCashier,
}: {
  onGoChat: () => void;
  onGoTasks: () => void;
  onGoCashier: () => void;
}) {
  const [activeBranch] = useActiveBranch();
  const today = todayISO();
  const statsKey = ["salon", "salon_stats_daily"];
  const invalidate = useInvalidator();
  const statsQ = useSalonList<{ stats: any[] }>("salon_stats_daily", statsKey, getSalonStats, { days: 60 });
  const upsertStat = useServerFn(upsertSalonStat);

  const todayRow = (statsQ.data?.stats ?? []).find((s: any) => s.stat_date === today);
  const expenses = String(todayRow?.expenses ?? 0);
  const pulse = (todayRow?.pulse_text as string | undefined) ?? "";
  const pulseDate = todayRow?.updated_at as string | undefined;

  const [pulseLocal, setPulseLocal] = useState<string>("");
  const [pulseDateLocal, setPulseDateLocal] = useState<string>("");
  const effectivePulse = pulseLocal || pulse;
  const effectivePulseDate = pulseDateLocal || pulseDate || "";

  async function saveExpense(v: string) {
    const n = Number(v) || 0;
    await upsertStat({ data: { stat_date: today, expenses: n } });
    invalidate([statsKey]);
  }

  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<{ dailyRevenue: number; dailyOps: number; monthlyRevenue: number; perBranchMonth?: Record<string, number> } | null>(null);
  const ask = useServerFn(askManager);
  const fetchStats = useServerFn(getStats);

  const todayLabel = new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });

  async function refreshPulse() {
    setLoading(true);
    try {
      const summary = live
        ? `الفرع النشط: ${activeBranch}. إيراد اليوم ${live.dailyRevenue}ج من ${live.dailyOps} عملية، إيراد الشهر ${live.monthlyRevenue}ج، مصاريف ${expenses}ج.`
        : `مصاريف اليوم ${expenses}ج.`;
      const res = await ask({
        data: {
          mode: "pulse",
          messages: [{ role: "user", content: `قولّي نبضة المحل النهارده. ${summary}` }],
          extra: `الفرع النشط حالياً: ${activeBranch}`,
        },
      });
      setPulseLocal(res.content);
      setPulseDateLocal(new Date().toISOString());
    } catch (e) {
      setPulseLocal(e instanceof Error ? e.message : "تعذر جلب النبضة.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshLive() {
    try {
      const res = await fetchStats({ data: { branch: activeBranch } });
      setLive({
        dailyRevenue: res.dailyRevenue,
        dailyOps: res.dailyOps,
        monthlyRevenue: res.monthlyRevenue,
        perBranchMonth: res.perBranchMonth,
      });
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refreshLive();
    if (!effectivePulse) {
      refreshPulse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch]);

  useEffect(() => {
    const channel = supabase
      .channel("operations-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "operations" }, () => {
        refreshLive();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <BranchSwitcher />
      <div className="rounded-3xl border border-border bg-gradient-to-br from-card to-background p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--gradient-gold)" }}>
            <span className="text-2xl">👔</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">مرحباً، أنا المدير</h1>
          <p className="text-sm text-muted-foreground">صالون أبو يوسف · {todayLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="إيرادات اليوم" value={String(live?.dailyRevenue ?? 0)} readOnly hint="مباشر" />
        <StatCard label="عمليات اليوم" value={String(live?.dailyOps ?? 0)} readOnly hint="مباشر" />
        <StatCard label="إيراد الشهر" value={String(live?.monthlyRevenue ?? 0)} readOnly hint="مباشر" />
        <StatCard label="مصاريف" value={expenses} onChange={saveExpense} />
      </div>

      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--gold)" }} />
            <h2 className="font-bold">نبضة المحل</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshLive}
              className="rounded-full border border-border px-2 py-1 text-[10px] hover:bg-secondary"
              title="تحديث الأرقام"
            >
              ↻ الأرقام
            </button>
            <button
              onClick={refreshPulse}
              disabled={loading}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {loading && !effectivePulse ? "المدير بيقرأ الأرقام..." : effectivePulse || "اكتب الأرقام واطلب التحديث."}
        </p>
        {effectivePulseDate && !loading ? (
          <div className="mt-2 text-[10px] text-muted-foreground">
            آخر تحديث: {new Date(effectivePulseDate).toLocaleString("ar-EG")}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickAction icon={<Receipt className="h-4 w-4" />} label="فتح الكاشير" onClick={onGoCashier} />
        <QuickAction icon={<NotebookPen className="h-4 w-4" />} label="تسجيل ملاحظة" onClick={onGoChat} />
        <QuickAction icon={<ListPlus className="h-4 w-4" />} label="إضافة أمر تنفيذي" onClick={onGoTasks} />
        <QuickAction icon={<FileText className="h-4 w-4" />} label="طلب تقرير" onClick={onGoChat} />
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm font-semibold transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
    >
      {icon}
      {label}
    </button>
  );
}