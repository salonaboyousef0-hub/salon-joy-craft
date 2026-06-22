import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, RefreshCw, Receipt } from "lucide-react";

import { BARBERS, ASSISTANTS, SERVICES } from "@/lib/salon-data";
import { addOperation, deleteOperation, listOperations } from "@/lib/operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { BranchSwitcher, useActiveBranch } from "./BranchSwitcher";

type Op = {
  id: string;
  service: string;
  amount: number;
  barber: string;
  assistant: string | null;
  notes: string | null;
  source: string;
  branch: string;
  created_at: string;
};

const ALL_SERVICES = [
  ...SERVICES.basic,
  ...SERVICES.hairSkin,
  ...SERVICES.packages,
];

export function Cashier({ lockedBranch }: { lockedBranch?: string } = {}) {
  const [activeBranchState] = useActiveBranch();
  const activeBranch = lockedBranch ?? activeBranchState;
  const [ops, setOps] = useState<Op[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    service: "قصة شعر",
    amount: "70",
    barber: BARBERS[0].name,
    assistant: "",
    notes: "",
  });

  const list = useServerFn(listOperations);
  const add = useServerFn(addOperation);
  const del = useServerFn(deleteOperation);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await list({ data: { limit: 100, branch: activeBranch } });
      setOps((res.operations ?? []) as Op[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [list, activeBranch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel("operations-cashier")
      .on("postgres_changes", { event: "*", schema: "public", table: "operations" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.service || !form.barber || !Number.isFinite(amount) || amount < 0) return;
    try {
      await add({
        data: {
          service: form.service,
          amount,
          barber: form.barber,
          assistant: form.assistant || undefined,
          notes: form.notes || undefined,
          source: "manual",
          branch: activeBranch,
        },
      });
      setForm({ ...form, notes: "" });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ في الإضافة");
    }
  }

  async function remove(id: string) {
    if (!confirm("متأكد من حذف العملية؟")) return;
    try {
      await del({ data: { id } });
      setOps(ops.filter((o) => o.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ في الحذف");
    }
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayOps = ops.filter((o) => new Date(o.created_at) >= todayStart);
  const todayTotal = todayOps.reduce((s, o) => s + Number(o.amount), 0);

  return (
    <div className="space-y-5">
      {lockedBranch ? null : <BranchSwitcher manage />}
      {lockedBranch ? (
        <div className="rounded-2xl border border-[var(--gold)]/30 bg-card p-3 text-xs text-muted-foreground">
          كاشير مقفول على فرع: <span className="font-bold gold-text">{lockedBranch}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">الكاشير <span className="text-xs font-normal text-muted-foreground">— {activeBranch}</span></h2>
          <p className="text-xs text-muted-foreground">إيراد اليوم: <span className="font-bold gold-text">{todayTotal} ج</span> · {todayOps.length} عملية</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> تحديث
        </button>
      </div>

      <form
        onSubmit={submit}
        className="rounded-2xl border border-border bg-card p-4"
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--gold)]">
          <Receipt className="h-4 w-4" /> تسجيل عملية جديدة
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <select
            value={form.service}
            onChange={(e) => {
              const svc = ALL_SERVICES.find((s) => s.name === e.target.value);
              setForm({ ...form, service: e.target.value, amount: svc ? String(svc.price) : form.amount });
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            {ALL_SERVICES.map((s) => (
              <option key={s.name} value={s.name}>{s.name} — {s.price} ج</option>
            ))}
            <option value={form.service}>خدمة مخصصة</option>
          </select>
          <input
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="المبلغ"
            inputMode="numeric"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <select
            value={form.barber}
            onChange={(e) => setForm({ ...form, barber: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            {BARBERS.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
          <select
            value={form.assistant}
            onChange={(e) => setForm({ ...form, assistant: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            <option value="">بدون مساعد</option>
            {ASSISTANTS.filter((a) => a.id !== "fahmy").map((a) => (
              <option key={a.id} value={a.name}>{a.name}</option>
            ))}
          </select>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="ملاحظات (اختياري)"
            className="md:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold text-[var(--primary-foreground)]"
          style={{ background: "var(--gradient-gold)" }}
        >
          <Plus className="h-4 w-4" /> تسجيل العملية
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-3 text-sm font-bold">آخر العمليات</div>
        {loading && ops.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">بيتم التحميل...</div>
        ) : ops.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">مفيش عمليات لسه.</div>
        ) : (
          <ul className="divide-y divide-border">
            {ops.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{o.service}</span>
                    <span className="text-sm font-bold gold-text">{Number(o.amount)} ج</span>
                    {o.source === "ai" ? (
                      <span className="rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] text-[var(--gold)]">من المدير</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {o.barber}
                    {o.assistant ? ` · مساعد: ${o.assistant}` : ""}
                    {" · "}
                    {new Date(o.created_at).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                  </div>
                  {o.notes ? <div className="mt-0.5 text-[11px] italic text-muted-foreground">{o.notes}</div> : null}
                </div>
                <button
                  onClick={() => remove(o.id)}
                  className="rounded-lg p-2 text-red-400 hover:bg-secondary"
                  title="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}