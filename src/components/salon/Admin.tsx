import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";

import { BARBERS, ASSISTANTS, SERVICES } from "@/lib/salon-data";
import { DAYS } from "./storage";
import {
  listChecklists,
  saveChecklist,
  saveChecklistItem,
  listBranchKpis,
  saveBranchKpi,
} from "@/lib/salon-data.functions";
import { useSalonList, useInvalidator, currentMonthStart } from "./useSalonData";

const CLEANING_ROTATION = ASSISTANTS.filter((a) => a.id !== "fahmy");

export function Admin() {
  const month = currentMonthStart();
  const kpiKey = ["salon", "branch_kpis", "admin", month];
  const invalidate = useInvalidator();
  const kpiQ = useSalonList<{ rows: any[] }>("branch_kpis", kpiKey, listBranchKpis);
  const saveKpiFn = useServerFn(saveBranchKpi);

  const monthRows = (kpiQ.data?.rows ?? []).filter(
    (k: any) => new Date(k.recorded_at).toISOString().slice(0, 7) === month.slice(0, 7),
  );
  function getKpi(name: string, kind: "revenue" | "clients") {
    const row = monthRows.find((r: any) => r.metric === `kpi_${kind}:${name}`);
    return { id: row?.id as string | undefined, value: Number(row?.value ?? 0) };
  }
  async function setKpi(name: string, kind: "revenue" | "clients", value: number) {
    const existing = getKpi(name, kind);
    await saveKpiFn({ data: { id: existing.id, metric: `kpi_${kind}:${name}`, value, period: "monthly" } });
    invalidate([kpiKey]);
  }

  const [deductMsg, setDeductMsg] = useState("");
  const [bonusMsg, setBonusMsg] = useState("");

  const cleaning = useMemo(
    () =>
      DAYS.map((d, i) => ({
        day: d,
        person: CLEANING_ROTATION[i % CLEANING_ROTATION.length].name,
      })),
    [],
  );

  function makeDeduction(form: HTMLFormElement) {
    const data = new FormData(form);
    const staff = String(data.get("staff") || "");
    const amount = String(data.get("amount") || "");
    const reason = String(data.get("reason") || "");
    setDeductMsg(
      `🔴 خصم — ${staff}\nالمبلغ: ${amount} ج\nالسبب: ${reason}\nالتاريخ: ${new Date().toLocaleDateString("ar-EG")}\n\nبرجاء تنفيذ الخصم وإبلاغي بالتأكيد.`,
    );
  }

  function makeBonus(form: HTMLFormElement) {
    const data = new FormData(form);
    const staff = String(data.get("staff") || "");
    const amount = String(data.get("amount") || "");
    const reason = String(data.get("reason") || "");
    setBonusMsg(
      `🎁 حافز — ${staff}\nالمبلغ: ${amount} ج\nالسبب: ${reason}\nبلّغه شخصياً وادفع مع مرتب الشهر.`,
    );
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    alert("اتنسخ ✅");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-lg font-bold">جدول نظافة دوري</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {cleaning.map((c) => (
            <div key={c.day} className="rounded-2xl border border-border bg-card p-3 text-center">
              <div className="text-xs text-muted-foreground">{c.day}</div>
              <div className="mt-1 font-semibold text-[var(--gold)]">{c.person}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">شيك ليست الفتح والقفل</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Checklist
            title="الفتح (سامي اشرف)"
            items={["فتح المحل ٩ صباحاً", "تشغيل الأجهزة وتسخين HydraFacial", "تنظيف الكراسي والمراية", "تجهيز المناشف", "مراجعة مواعيد اليوم"]}
          />
          <Checklist
            title="القفل (محمود عبده)"
            items={["تسليم كاش اليوم لفهمي", "إطفاء الأجهزة", "نظافة شاملة", "غلق الخزينة", "قفل المحل وتفعيل الكاميرات"]}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">KPI الحلاقين الشهري</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-right">الحلاق</th>
                <th className="p-2 text-center">إيراد</th>
                <th className="p-2 text-center">عملاء</th>
                <th className="p-2 text-center">متوسط التذكرة</th>
              </tr>
            </thead>
            <tbody>
              {BARBERS.map((b) => {
                const rev = getKpi(b.name, "revenue").value;
                const cli = getKpi(b.name, "clients").value;
                const avg = cli > 0 ? Math.round(rev / cli) : 0;
                return (
                  <tr key={b.id} className="border-b border-border/40 last:border-0">
                    <td className="p-2 font-semibold">{b.name}</td>
                    <td className="p-2 text-center">
                      <input
                        defaultValue={rev}
                        key={`rev-${b.name}-${rev}`}
                        onBlur={(e) => setKpi(b.name, "revenue", Number(e.target.value) || 0)}
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-center outline-none"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        defaultValue={cli}
                        key={`cli-${b.name}-${cli}`}
                        onBlur={(e) => setKpi(b.name, "clients", Number(e.target.value) || 0)}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-center outline-none"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="p-2 text-center font-semibold text-[var(--gold)]">{avg} ج</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card title="آلة الخصم">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              makeDeduction(e.currentTarget);
            }}
            className="space-y-2 text-sm"
          >
            <StaffSelect name="staff" />
            <input name="amount" placeholder="المبلغ (ج)" inputMode="numeric" className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none" required />
            <input name="reason" placeholder="السبب" className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none" required />
            <button className="w-full rounded-lg bg-red-500/20 py-2 text-sm font-semibold text-red-300">ولّد رسالة الخصم</button>
          </form>
          {deductMsg ? <MessageBox text={deductMsg} onCopy={() => copy(deductMsg)} /> : null}
        </Card>

        <Card title="آلة الحوافز">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              makeBonus(e.currentTarget);
            }}
            className="space-y-2 text-sm"
          >
            <StaffSelect name="staff" />
            <input name="amount" placeholder="المبلغ (ج)" inputMode="numeric" className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none" required />
            <input name="reason" placeholder="السبب / الإنجاز" className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none" required />
            <button className="w-full rounded-lg py-2 text-sm font-semibold text-[var(--primary-foreground)]" style={{ background: "var(--gradient-gold)" }}>
              ولّد رسالة الحافز
            </button>
          </form>
          {bonusMsg ? <MessageBox text={bonusMsg} onCopy={() => copy(bonusMsg)} /> : null}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">قائمة الأسعار</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <PriceList title="أساسي" items={SERVICES.basic} />
          <PriceList title="شعر وبشرة" items={SERVICES.hairSkin} />
          <PriceList title="باكدجات" items={SERVICES.packages} highlight />
        </div>
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  const key = ["salon", "checklist", title];
  const invalidate = useInvalidator();
  const q = useSalonList<{ lists: any[] }>("checklists", key, listChecklists);
  useSalonList<{ lists: any[] }>("checklist_items", [...key, "items"], listChecklists);
  const saveListFn = useServerFn(saveChecklist);
  const saveItemFn = useServerFn(saveChecklistItem);

  const list = (q.data?.lists ?? []).find((l: any) => l.title === title);

  useEffect(() => {
    if (q.isLoading) return;
    if (!list) {
      saveListFn({ data: { title } }).then(() => invalidate([key]));
      return;
    }
    const labels = new Set((list.items ?? []).map((it: any) => it.label));
    const missing = items.filter((it) => !labels.has(it));
    if (missing.length) {
      Promise.all(
        missing.map((label, i) =>
          saveItemFn({ data: { checklist_id: list.id, label, position: i } }),
        ),
      ).then(() => invalidate([key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isLoading, list?.id]);

  async function toggle(itemId: string, checklistId: string, label: string, done: boolean) {
    await saveItemFn({ data: { id: itemId, checklist_id: checklistId, label, done } });
    invalidate([key]);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 font-bold text-[var(--gold)]">{title}</div>
      <ul className="space-y-1.5 text-sm">
        {items.map((label) => {
          const it = (list?.items ?? []).find((x: any) => x.label === label);
          const done = !!it?.done;
          return (
            <li key={label}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={!it}
                  onChange={(e) => it && list && toggle(it.id, list.id, label, e.target.checked)}
                  className="h-4 w-4 accent-[var(--gold)]"
                />
                <span className={done ? "text-muted-foreground line-through" : ""}>{label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 font-bold text-[var(--gold)]">{title}</div>
      {children}
    </div>
  );
}

function StaffSelect({ name }: { name: string }) {
  const all = [...BARBERS.map((b) => b.name), ...ASSISTANTS.map((a) => a.name)];
  return (
    <select name={name} required className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none">
      <option value="">اختر الموظف</option>
      {all.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function MessageBox({ text, onCopy }: { text: string; onCopy: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs">
      <pre className="whitespace-pre-wrap font-sans">{text}</pre>
      <button onClick={onCopy} className="mt-2 flex items-center gap-1 text-[var(--gold)]">
        <Copy className="h-3 w-3" /> انسخ لإرساله على واتساب
      </button>
    </div>
  );
}

function PriceList({
  title,
  items,
  highlight,
}: {
  title: string;
  items: { name: string; price: number; was?: number; from?: boolean }[];
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-card p-4 ${highlight ? "border-[var(--gold)]" : "border-border"}`}>
      <div className="mb-2 font-bold text-[var(--gold)]">{title}</div>
      <ul className="space-y-1.5 text-sm">
        {items.map((it) => (
          <li key={it.name} className="flex items-center justify-between border-b border-border/40 pb-1.5 last:border-0">
            <span>{it.name}</span>
            <span className="font-semibold">
              {it.from ? "من " : ""}
              {it.price} ج
              {it.was ? <span className="ml-1 text-xs text-muted-foreground line-through">{it.was}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}