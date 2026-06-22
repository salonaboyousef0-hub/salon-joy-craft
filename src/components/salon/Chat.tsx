import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2, CheckCircle2, AlertCircle } from "lucide-react";

import { askManager } from "@/lib/manager-ai.functions";
import {
  listChatMessages,
  appendChatMessage,
  clearChatMessages,
} from "@/lib/salon-data.functions";
import { useSalonList, useInvalidator } from "./useSalonData";
import { useActiveBranch } from "./BranchSwitcher";

const SUGGESTIONS = [
  "مصطفى اتأخر النهارده",
  "ضيف عملية حلاقة 70 جنيه مع مصطفى",
  "سجّل باكدج VIP بـ 300 مع احمد ياسر ومساعد سامي",
  "الإيراد النهارده وطي",
  "سامي بيشتكي من حسن",
];

function renderMarkdown(text: string) {
  // very lightweight: bold + line breaks + bullets
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, '<div class="mt-2 font-bold text-[var(--gold)]">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="mt-2 font-bold text-[var(--gold)]">$1</div>')
    .replace(/^(\d+)\.\s(.+)$/gm, '<div class="my-0.5">$1. $2</div>')
    .replace(/^- (.+)$/gm, '<div class="my-0.5">• $1</div>')
    .replace(/\n/g, "<br/>");
  return { __html: html };
}

type ExecutedAction = {
  tool: string;
  service: string;
  amount: number;
  barber: string;
  assistant: string | null;
  ok: boolean;
  error: string | null;
  id: string | null;
};

type Role = "user" | "assistant" | "system";
type ExtendedMsg = { id?: string; role: Role; content: string; actions?: ExecutedAction[] };

export function Chat() {
  const [activeBranch] = useActiveBranch();
  const invalidate = useInvalidator();
  const chatKey = ["salon", "chat-messages"];
  const { data } = useSalonList<{ messages: any[] }>(
    "chat_messages",
    chatKey,
    listChatMessages,
  );
  const append = useServerFn(appendChatMessage);
  const clear = useServerFn(clearChatMessages);
  const messages: ExtendedMsg[] = (data?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as Role,
    content: m.content,
  }));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<{ id: string; actions: ExecutedAction[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ask = useServerFn(askManager);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { role: "user" as Role, content: trimmed }];
    setInput("");
    setLoading(true);
    try {
      await append({ data: { role: "user", content: trimmed } });
      invalidate([chatKey]);
      const res = await ask({
        data: {
          mode: "chat",
          messages: next
            .slice(-20)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map(({ role, content }) => ({ role: role as "user" | "assistant", content })),
          extra: `الفرع النشط حالياً: ${activeBranch}. لما تضيف/تقرأ من غير ما الرسالة تذكر فرع، استخدم الفرع ده. لو طلب تقارير لكل المحل متمررش branch.`,
        },
      });
      const content = res.content || (res.executedActions?.length ? "تم ✅" : "");
      const saved = await append({ data: { role: "assistant", content: content || "تم ✅" } });
      if (res.executedActions?.length && saved?.message?.id) {
        setPendingActions({ id: saved.message.id, actions: res.executedActions as ExecutedAction[] });
      }
      invalidate([chatKey]);
    } catch (e) {
      await append({ data: { role: "assistant", content: e instanceof Error ? e.message : "حصل خطأ." } });
      invalidate([chatKey]);
    } finally {
      setLoading(false);
    }
  }

  async function doClear() {
    await clear({ data: {} });
    setPendingActions(null);
    invalidate([chatKey]);
  }

  // Merge in-session executed actions onto the matching persisted assistant message
  const merged: ExtendedMsg[] = messages.map((m) =>
    pendingActions && m.id === pendingActions.id ? { ...m, actions: pendingActions.actions } : m,
  );

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">الشات مع المدير <span className="text-xs font-normal text-muted-foreground">— {activeBranch}</span></h2>
        {merged.length > 0 ? (
          <button
            onClick={doClear}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" /> مسح
          </button>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-3xl border border-border bg-card/40 p-4"
      >
        {merged.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="text-3xl">👔</div>
              <p className="mt-2 text-sm text-muted-foreground">
                قول للمدير اللي في دماغك — قرارات، شكاوى، تقارير، أوامر تنفيذية.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {merged.map((m, i) => (
              <li key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "border border-border bg-secondary"
                      : "border border-[var(--gold)]/40 bg-background"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <>
                      <div className="mb-1 text-[10px] font-bold text-[var(--gold)]">المدير</div>
                      {m.content ? <div dangerouslySetInnerHTML={renderMarkdown(m.content)} /> : null}
                      {m.actions && m.actions.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {m.actions.map((a, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                                a.ok
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                  : "border-red-500/40 bg-red-500/10 text-red-200"
                              }`}
                            >
                              {a.ok ? (
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              )}
                              <div className="flex-1">
                                {a.ok ? (
                                  <>
                                    <span className="font-bold">اتسجلت عملية:</span>{" "}
                                    {a.service} · {a.amount} ج · {a.barber}
                                    {a.assistant ? ` · مساعد: ${a.assistant}` : ""}
                                  </>
                                ) : (
                                  <>فشل التسجيل: {a.error}</>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div>{m.content}</div>
                  )}
                </div>
              </li>
            ))}
            {loading ? (
              <li className="flex justify-end">
                <div className="rounded-2xl border border-[var(--gold)]/40 bg-background px-4 py-3 text-sm text-muted-foreground">
                  المدير بيفكر...
                </div>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {merged.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-[var(--gold)]"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب للمدير..."
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="grid h-10 w-10 place-items-center rounded-xl text-[var(--primary-foreground)] disabled:opacity-50"
          style={{ background: "var(--gradient-gold)" }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}