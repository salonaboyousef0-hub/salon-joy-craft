import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Trash2, ExternalLink, Power, Pencil, Wifi, WifiOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";

import {
  addExternalBranch,
  listExternalBranches,
  getBranchStats,
  deleteExternalBranch,
  updateExternalBranch,
  testBranchConnection,
} from "@/lib/external-branches.functions";
import { supabase } from "@/integrations/supabase/client";

type Branch = {
  id: string;
  name: string;
  cashier_url: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  active: boolean;
};

type StatRow = {
  branchId: string;
  branchName: string;
  cashierUrl: string | null;
  dailyRevenue: number;
  dailyOps: number;
  monthlyRevenue: number;
  error: string | null;
};

export function ExternalBranches() {
  const list = useServerFn(listExternalBranches);
  const add = useServerFn(addExternalBranch);
  const stats = useServerFn(getBranchStats);
  const del = useServerFn(deleteExternalBranch);
  const upd = useServerFn(updateExternalBranch);
  const test = useServerFn(testBranchConnection);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<StatRow[]>([]);
  const [totals, setTotals] = useState({ dailyRevenue: 0, dailyOps: 0, monthlyRevenue: 0 });
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", cashier_url: "", supabase_url: "", supabase_anon_key: "" });
  const [statuses, setStatuses] = useState<Record<string, { state: "idle" | "testing" | "online" | "offline"; error?: string; count?: number }>>({});

  async function refresh() {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        list(),
        stats({ data: filter ? { branchId: filter } : undefined }),
      ]);
      setBranches(b.branches as Branch[]);
      setRows(s.branches);
      setTotals(s.totals);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const ch = supabase
      .channel("external_branches_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "external_branches" }, () => refresh())
      .subscribe();
    const interval = setInterval(refresh, 20000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.supabase_url || !form.supabase_anon_key) return;
    if (editingId) {
      await upd({
        data: {
          id: editingId,
          name: form.name,
          cashier_url: form.cashier_url || null,
          supabase_url: form.supabase_url,
          supabase_anon_key: form.supabase_anon_key,
        },
      });
    } else {
      await add({
        data: {
          name: form.name,
          cashier_url: form.cashier_url || null,
          supabase_url: form.supabase_url,
          supabase_anon_key: form.supabase_anon_key,
        },
      });
    }
    setForm({ name: "", cashier_url: "", supabase_url: "", supabase_anon_key: "" });
    setEditingId(null);
    setShowForm(false);
    refresh();
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setForm({
      name: b.name,
      cashier_url: b.cashier_url ?? "",
      supabase_url: b.supabase_url,
      supabase_anon_key: b.supabase_anon_key,
    });
    setShowForm(true);
  }

  async function runTest(branchId: string, creds?: { supabase_url: string; supabase_anon_key: string }) {
    setStatuses((s) => ({ ...s, [branchId]: { state: "testing" } }));
    const res = await test({ data: creds ? creds : { branchId } });
    setStatuses((s) => ({
      ...s,
      [branchId]: res.ok
        ? { state: "online", count: res.count }
        : { state: "offline", error: res.error },
    }));
  }

  async function testFormConnection() {
    if (!form.supabase_url || !form.supabase_anon_key) return;
    setStatuses((s) => ({ ...s, __form: { state: "testing" } }));
    const res = await test({
      data: { supabase_url: form.supabase_url, supabase_anon_key: form.supabase_anon_key },
    });
    setStatuses((s) => ({
      ...s,
      __form: res.ok
        ? { state: "online", count: res.count }
        : { state: "offline", error: res.error },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">الفروع الخارجية</h2>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                setEditingId(null);
                setForm({ name: "", cashier_url: "", supabase_url: "", supabase_anon_key: "" });
              } else {
                setShowForm(true);
              }
            }}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--gradient-gold)", color: "#1a1500" }}
          >
            <Plus className="h-3 w-3" />
            {editingId ? "إلغاء التعديل" : "إضافة فرع"}
          </button>
        </div>
      </div>

      {showForm ? (
        <form onSubmit={onAdd} className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="text-xs font-bold text-muted-foreground">
            {editingId ? "تعديل فرع" : "فرع جديد"}
          </div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="اسم الفرع"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.cashier_url}
            onChange={(e) => setForm({ ...form, cashier_url: e.target.value })}
            placeholder="رابط الكاشير (اختياري)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.supabase_url}
            onChange={(e) => setForm({ ...form, supabase_url: e.target.value })}
            placeholder="Supabase URL للفرع"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.supabase_anon_key}
            onChange={(e) => setForm({ ...form, supabase_anon_key: e.target.value })}
            placeholder="Supabase anon key"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={testFormConnection}
              className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold hover:bg-secondary"
            >
              {statuses.__form?.state === "testing" ? (
                <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> جاري الاختبار</span>
              ) : (
                "اختبار الاتصال"
              )}
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg py-2 text-sm font-semibold"
              style={{ background: "var(--gradient-gold)", color: "#1a1500" }}
            >
              {editingId ? "تحديث" : "حفظ"}
            </button>
          </div>
          {statuses.__form && statuses.__form.state !== "testing" ? (
            <div
              className={`flex items-center gap-1 text-xs ${
                statuses.__form.state === "online" ? "text-green-500" : "text-destructive"
              }`}
            >
              {statuses.__form.state === "online" ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> اتصال ناجح — جدول operations يعمل ({statuses.__form.count} عملية)
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3" /> فشل: {statuses.__form.error}
                </>
              )}
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="إيراد اليوم" value={totals.dailyRevenue} />
        <Stat label="عمليات اليوم" value={totals.dailyOps} plain />
        <Stat label="إيراد الشهر" value={totals.monthlyRevenue} />
      </div>

      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="">كل الفروع</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <div className="space-y-2">
        {rows.map((r) => {
          const branch = branches.find((b) => b.id === r.branchId);
          const st = statuses[r.branchId];
          const online = st?.state === "online" || (!st && !r.error);
          return (
            <div key={r.branchId} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{r.branchName}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] ${
                        st?.state === "testing"
                          ? "bg-muted text-muted-foreground"
                          : online
                          ? "bg-green-500/10 text-green-500"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {st?.state === "testing" ? (
                        <><Loader2 className="h-2.5 w-2.5 animate-spin" /> اختبار</>
                      ) : online ? (
                        <><Wifi className="h-2.5 w-2.5" /> متصل</>
                      ) : (
                        <><WifiOff className="h-2.5 w-2.5" /> غير متصل</>
                      )}
                    </span>
                  </div>
                  {r.error ? <div className="text-[10px] text-destructive">{r.error}</div> : null}
                  {st?.state === "offline" && st.error ? (
                    <div className="text-[10px] text-destructive">{st.error}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => runTest(r.branchId)}
                    className="rounded-full border border-border p-1.5 hover:bg-secondary"
                    title="اختبار الاتصال"
                  >
                    {st?.state === "testing" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wifi className="h-3 w-3" />
                    )}
                  </button>
                  {branch ? (
                    <button
                      onClick={() => startEdit(branch)}
                      className="rounded-full border border-border p-1.5 hover:bg-secondary"
                      title="تعديل"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  ) : null}
                  {r.cashierUrl ? (
                    <a
                      href={r.cashierUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-border p-1.5 hover:bg-secondary"
                      title="فتح الكاشير"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  {branch ? (
                    <button
                      onClick={async () => {
                        await upd({ data: { id: branch.id, active: !branch.active } });
                        refresh();
                      }}
                      className="rounded-full border border-border p-1.5 hover:bg-secondary"
                      title={branch.active ? "تعطيل" : "تفعيل"}
                    >
                      <Power className={`h-3 w-3 ${branch.active ? "text-green-500" : "text-muted-foreground"}`} />
                    </button>
                  ) : null}
                  <button
                    onClick={async () => {
                      if (!confirm(`حذف فرع ${r.branchName}؟`)) return;
                      await del({ data: { id: r.branchId } });
                      refresh();
                    }}
                    className="rounded-full border border-border p-1.5 hover:bg-secondary"
                    title="حذف"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Mini label="اليوم" value={r.dailyRevenue} />
                <Mini label="عمليات" value={r.dailyOps} plain />
                <Mini label="الشهر" value={r.monthlyRevenue} />
              </div>
            </div>
          );
        })}
        {!rows.length ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            لا يوجد فروع خارجية. أضف أول فرع للبدء.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, plain }: { label: string; value: number; plain?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold gold-text">{value.toLocaleString("ar-EG")}</div>
      {!plain ? <div className="text-[9px] text-muted-foreground">جنيه</div> : null}
    </div>
  );
}

function Mini({ label, value, plain }: { label: string; value: number; plain?: boolean }) {
  return (
    <div className="rounded-lg bg-background/50 p-2 text-center">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="font-bold">{value.toLocaleString("ar-EG")}{!plain ? "ج" : ""}</div>
    </div>
  );
}