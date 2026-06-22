import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, LogOut } from "lucide-react";

import { Cashier } from "@/components/salon/Cashier";
import { getBranchBySlug, verifyBranchPin } from "@/lib/branches.functions";

export const Route = createFileRoute("/c/$slug")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `كاشير الفرع — ${params.slug}` },
      { name: "description", content: "كاشير مخصص للفرع — سجّل العمليات بسرعة." },
    ],
  }),
  component: BranchCashierPage,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-foreground">
      <div>
        <div className="mb-2 text-lg font-bold">حصل خطأ</div>
        <a href="/" className="text-xs underline">رجوع</a>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-foreground">
      <div>
        <div className="mb-2 text-lg font-bold">الفرع مش موجود</div>
        <a href="/" className="text-xs underline">رجوع للرئيسية</a>
      </div>
    </div>
  ),
});

function storageKey(slug: string) {
  return `salon:branch-auth:${slug}`;
}

function BranchCashierPage() {
  const { slug } = Route.useParams();
  const getBranch = useServerFn(getBranchBySlug);
  const verifyPin = useServerFn(verifyBranchPin);

  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [requiresPin, setRequiresPin] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getBranch({ data: { slug } });
        if (!alive) return;
        if (!res.branch) {
          throw notFound();
        }
        setBranch(res.branch as { id: string; name: string; slug: string });
        setRequiresPin(res.requiresPin);
        if (!res.requiresPin) {
          setAuthed(true);
        } else if (typeof window !== "undefined" && sessionStorage.getItem(storageKey(slug)) === "1") {
          setAuthed(true);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "خطأ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, getBranch]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await verifyPin({ data: { slug, pin: pin.trim() } });
      if (!res.ok) {
        setErr("PIN غير صحيح");
        return;
      }
      sessionStorage.setItem(storageKey(slug), "1");
      setAuthed(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطأ");
    }
  }

  function logout() {
    sessionStorage.removeItem(storageKey(slug));
    setAuthed(false);
    setPin("");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-xs text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-foreground">
        <div>
          <div className="mb-2 text-lg font-bold">الفرع مش موجود</div>
          <a href="/" className="text-xs underline">رجوع</a>
        </div>
      </div>
    );
  }

  if (requiresPin && !authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <form onSubmit={submitPin} className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-bold gold-text">
            <KeyRound className="h-4 w-4" /> دخول كاشير {branch.name}
          </div>
          <p className="text-[11px] text-muted-foreground">ادخل PIN الخاص بالفرع للمتابعة.</p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="PIN"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-widest outline-none"
          />
          {err ? <div className="text-center text-xs text-red-400">{err}</div> : null}
          <button
            type="submit"
            className="w-full rounded-lg py-2 text-sm font-bold text-[var(--primary-foreground)]"
            style={{ background: "var(--gradient-gold)" }}
          >
            دخول
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 pb-10 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">كاشير {branch.name}</h1>
            <p className="text-[11px] text-muted-foreground">كل العمليات بتتسجل تلقائيًا على هذا الفرع.</p>
          </div>
          {requiresPin ? (
            <button
              onClick={logout}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              <LogOut className="h-3 w-3" /> خروج
            </button>
          ) : null}
        </div>
        <Cashier lockedBranch={branch.name} />
      </main>
    </div>
  );
}