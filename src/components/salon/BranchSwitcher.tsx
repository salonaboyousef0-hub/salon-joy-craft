import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Building2, X, Copy, Link2, KeyRound } from "lucide-react";

import { addBranch, deleteBranch, listBranches, updateBranchPin } from "@/lib/branches.functions";
import { supabase } from "@/integrations/supabase/client";
import { useLocalState } from "./storage";

export const DEFAULT_BRANCH = "صالون أبو يوسف – الفرع الرئيسي";

export function useActiveBranch() {
  return useLocalState<string>("salon:activeBranch", DEFAULT_BRANCH);
}

type Branch = { id: string; name: string; location: string | null; notes: string | null; active: boolean; slug: string; pin: string | null };

export function BranchSwitcher({ manage = false }: { manage?: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [active, setActive] = useActiveBranch();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [pin, setPin] = useState("");

  const list = useServerFn(listBranches);
  const add = useServerFn(addBranch);
  const del = useServerFn(deleteBranch);
  const updPin = useServerFn(updateBranchPin);

  const refresh = useCallback(async () => {
    try {
      const res = await list({});
      setBranches(res.branches as Branch[]);
    } catch (e) {
      console.error(e);
    }
  }, [list]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("branches-switcher")
      .on("postgres_changes", { event: "*", schema: "public", table: "branches" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      await add({ data: { name: n, location: location.trim() || undefined, pin: pin.trim() || undefined } });
      setName("");
      setLocation("");
      setPin("");
      setActive(n);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    }
  }

  function cashierLink(slug: string) {
    if (typeof window === "undefined") return `/c/${slug}`;
    return `${window.location.origin}/c/${slug}`;
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(cashierLink(slug));
      alert("تم نسخ الرابط");
    } catch {
      prompt("انسخ الرابط:", cashierLink(slug));
    }
  }

  async function setBranchPin(b: Branch) {
    const next = prompt(`PIN جديد لفرع "${b.name}" (اتركه فاضي لإلغاء القفل):`, b.pin ?? "");
    if (next === null) return;
    await updPin({ data: { id: b.id, pin: next.trim() || null } });
    refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-4 w-4 text-[var(--gold)]" />
          <span>الفرع النشط</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-border px-2 py-1 text-[10px] hover:bg-secondary"
        >
          {open ? "إغلاق" : "إدارة الفروع"}
        </button>
      </div>
      <select
        value={active}
        onChange={(e) => setActive(e.target.value)}
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold gold-text outline-none"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.name}>{b.name}</option>
        ))}
        {branches.find((b) => b.name === active) ? null : (
          <option value={active}>{active}</option>
        )}
      </select>

      {open && manage ? (
        <div className="mt-3 space-y-2">
          <form onSubmit={submit} className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الفرع الجديد"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none md:col-span-1"
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="العنوان (اختياري)"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none md:col-span-1"
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN دخول (اختياري)"
              inputMode="numeric"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none md:col-span-1"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1 rounded-lg py-2 text-sm font-bold text-[var(--primary-foreground)]"
              style={{ background: "var(--gradient-gold)" }}
            >
              <Plus className="h-4 w-4" /> فتح فرع
            </button>
          </form>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {branches.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 p-2 text-xs md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="font-bold">{b.name}</div>
                  {b.location ? <div className="text-muted-foreground">{b.location}</div> : null}
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    <span className="truncate">/c/{b.slug}</span>
                    {b.pin ? <span className="rounded-full bg-[var(--gold)]/15 px-1.5 py-0.5 text-[var(--gold)]">PIN مفعّل</span> : <span className="opacity-70">بدون PIN</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyLink(b.slug)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:bg-secondary"
                    title="نسخ رابط الكاشير"
                  >
                    <Copy className="h-3 w-3" /> رابط
                  </button>
                  <button
                    onClick={() => setBranchPin(b)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:bg-secondary"
                    title="تعديل PIN"
                  >
                    <KeyRound className="h-3 w-3" /> PIN
                  </button>
                  {b.name !== DEFAULT_BRANCH ? (
                    <button
                      onClick={async () => {
                        if (!confirm(`حذف فرع "${b.name}"؟ العمليات هتفضل موجودة لكن الفرع هيختفي من القائمة.`)) return;
                        await del({ data: { id: b.id } });
                        if (active === b.name) setActive(DEFAULT_BRANCH);
                        refresh();
                      }}
                      className="rounded-lg p-1.5 text-red-400 hover:bg-secondary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}