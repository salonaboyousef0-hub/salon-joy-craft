import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — المدير" },
      { name: "description", content: "تسجيل الدخول لإدارة المهام والفروع." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { salon_name: name || "صالوني" },
          },
        });
        if (error) throw error;
        setInfo("تم إنشاء الحساب. تحقق من بريدك أو سجّل الدخول.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold">{mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            ادخل لإدارة المهام والفروع
          </p>
          <form onSubmit={onSubmit} className="mt-4 space-y-2">
            {mode === "signup" ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم الصالون (اختياري)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            ) : null}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {error ? <div className="text-xs text-destructive">{error}</div> : null}
            {info ? <div className="text-xs text-green-500">{info}</div> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--gradient-gold)", color: "#1a1500" }}
            >
              {busy ? "..." : mode === "signin" ? "دخول" : "إنشاء حساب"}
            </button>
          </form>
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setInfo(null);
            }}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "ما عندكش حساب؟ سجّل" : "عندك حساب بالفعل؟ دخول"}
          </button>
        </div>
      </div>
    </div>
  );
}