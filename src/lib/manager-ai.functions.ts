import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { SYSTEM_PROMPT } from "./salon-data";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "add_operation",
      description:
        "سجّل عملية جديدة في نظام الكاشير (إيراد فعلي). استخدمها لما صاحب المحل يطلب إضافة عملية أو يقول إن فلان عمل خدمة كذا بكذا جنيه.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "اسم الخدمة، مثل: قصة شعر، حلاقة ذقن، باكدج VIP، تنظيف عميق" },
          amount: { type: "number", description: "المبلغ بالجنيه المصري" },
          barber: {
            type: "string",
            description: "اسم الحلاق المنفّذ. لازم يكون واحد من: مصطفى يوسف، احمد ياسر، عزت نصر.",
          },
          assistant: { type: "string", description: "اسم المساعد لو موجود (اختياري)" },
          notes: { type: "string", description: "أي ملاحظات إضافية (اختياري)" },
          branch: { type: "string", description: "اسم الفرع. لو مش متحدد استخدم الفرع النشط من سياق صاحب المحل." },
        },
        required: ["service", "amount", "barber"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_operations",
      description: "اقرأ آخر العمليات من الكاشير. استخدمها قبل ما تتكلم عن الأرقام أو قبل ما تعدّل/تحذف.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "عدد العمليات (افتراضي 20، أقصى 100)" },
          barber: { type: "string", description: "فلتر باسم حلاق (اختياري)" },
          today_only: { type: "boolean", description: "اقرأ عمليات اليوم بس" },
          branch: { type: "string", description: "فلتر باسم الفرع (اختياري)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_operation",
      description: "احذف عملية من الكاشير بمعرفها (id). استدعِ list_operations الأول لتجيب الـ id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "uuid العملية" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_operation",
      description: "عدّل عملية موجودة (المبلغ، الحلاق، المساعد، الملاحظات).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "uuid العملية" },
          service: { type: "string" },
          amount: { type: "number" },
          barber: { type: "string" },
          assistant: { type: "string" },
          notes: { type: "string" },
          branch: { type: "string", description: "نقل العملية لفرع تاني (اختياري)" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_stats",
      description: "اقرأ ملخص الإيرادات والعمليات (اليوم والشهر + توزيع لكل حلاق + توزيع لكل فرع). مرّر branch لتحصر النتيجة على فرع واحد.",
      parameters: { type: "object", properties: { branch: { type: "string" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_branches",
      description: "جيب قائمة الفروع المتاحة.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_branch",
      description: "أضف فرع جديد (مثلاً افتتاح فرع تاني).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          location: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
];

const SAFE_BARBERS = ["مصطفى يوسف", "احمد ياسر", "عزت نصر"];

async function callGateway(body: unknown, apiKey: string) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("الطلبات كتيرة دلوقتي — جرّب تاني بعد دقيقة.");
    if (resp.status === 402) throw new Error("رصيد Lovable AI خلص — اشحن الـ workspace.");
    console.error("AI gateway error", resp.status, text);
    throw new Error("المدير مش قادر يرد دلوقتي.");
  }
  return (await resp.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
}

function normalizeBarber(name: string): string {
  const trimmed = name.trim();
  const found = SAFE_BARBERS.find((b) => b === trimmed || trimmed.includes(b.split(" ")[0]));
  return found ?? trimmed;
}

export const askManager = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      messages: z.array(MessageSchema).min(1).max(40),
      mode: z.enum(["chat", "pulse", "tasks"]).default("chat"),
      extra: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY غير مفعّل في Lovable Cloud.");
    }

    let systemPrompt = SYSTEM_PROMPT;
    let useTools = false;
    if (data.mode === "pulse") {
      systemPrompt +=
        "\n\nالمطلوب: جملة قصيرة جداً (سطر أو سطرين) تلخص نبضة المحل النهارده بأسلوب مدير شغوف. ابدأ مباشرة بدون مقدمات.";
    } else if (data.mode === "tasks") {
      systemPrompt +=
        "\n\nالمطلوب: رد JSON صافي فقط (بدون أي شرح أو علامات code block) بالشكل التالي:\n{\n  \"tasks\": [\n    {\"title\": \"...\", \"category\": \"نظافة|متابعة موظفين|عمليات|تطوير\", \"priority\": \"high|medium|low\", \"assignee\": \"محمد فهمي|سامي اشرف|...\"}\n  ]\n}\nمن 4 لـ 6 مهام لليوم، موجهة في الأساس لمحمد فهمي.";
    } else {
      useTools = true;
      systemPrompt +=
        "\n\nعندك سيطرة كاملة على نظام الكاشير (متعدد الفروع) عن طريق الأدوات: add_operation, list_operations, delete_operation, update_operation, get_stats, list_branches, add_branch. كل عملية مربوطة بـ branch (اسم الفرع). لو صاحب المحل بعت لك سياق فيه (الفرع النشط: ...) استخدمه افتراضياً في الإضافة والقراءة. لو طلب تقارير لكل الفروع متمررش branch. لو ذكر فرع تاني بالاسم، استخدمه. قبل أي تعديل أو حذف استدعِ list_operations الأول لتجيب الـ id. بعد التنفيذ أكّد بسطر قصير ووضّح الفرع.";
    }

    const userExtra = data.extra ? `\n\nسياق إضافي من صاحب المحل:\n${data.extra}` : "";

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt + userExtra },
      ...data.messages,
    ];

    const body: Record<string, unknown> = {
      model: "google/gemini-3-flash-preview",
      messages,
    };
    if (useTools) {
      body.tools = TOOLS;
      body.tool_choice = "auto";
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
    const executedActions: ExecutedAction[] = [];

    let json = await callGateway(body, apiKey);
    let msg = json.choices?.[0]?.message;

    // Handle tool calls (up to 5 rounds for chained reads + writes)
    for (let round = 0; round < 5 && msg?.tool_calls && msg.tool_calls.length > 0; round++) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>; } catch { args = {}; }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const name = call.function.name;
        try {
          if (name === "add_operation") {
            const parsed = z
              .object({
                service: z.string().min(1).max(120),
                amount: z.number().nonnegative().max(1000000),
                barber: z.string().min(1).max(80),
                assistant: z.string().max(80).optional(),
                notes: z.string().max(500).optional(),
                branch: z.string().min(1).max(120).optional(),
              })
              .parse(args);
            const { data: row, error } = await supabaseAdmin
              .from("operations")
              .insert({
                service: parsed.service,
                amount: parsed.amount,
                barber: normalizeBarber(parsed.barber),
                assistant: parsed.assistant ?? null,
                notes: parsed.notes ?? null,
                source: "ai",
                ...(parsed.branch ? { branch: parsed.branch } : {}),
              })
              .select()
              .single();
            if (error) throw new Error(error.message);
            executedActions.push({
              tool: "add_operation",
              service: parsed.service,
              amount: parsed.amount,
              barber: normalizeBarber(parsed.barber),
              assistant: parsed.assistant ?? null,
              ok: true,
              error: null,
              id: row?.id ?? null,
            });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ ok: true, operation: row }),
            });
          } else if (name === "list_operations") {
            const parsed = z
              .object({
                limit: z.number().int().min(1).max(100).optional(),
                barber: z.string().max(80).optional(),
                today_only: z.boolean().optional(),
                branch: z.string().max(120).optional(),
              })
              .parse(args);
            let q = supabaseAdmin
              .from("operations")
              .select("id, service, amount, barber, assistant, notes, source, branch, created_at")
              .order("created_at", { ascending: false })
              .limit(parsed.limit ?? 20);
            if (parsed.barber) q = q.eq("barber", normalizeBarber(parsed.barber));
            if (parsed.branch) q = q.eq("branch", parsed.branch);
            if (parsed.today_only) {
              const start = new Date();
              start.setHours(0, 0, 0, 0);
              q = q.gte("created_at", start.toISOString());
            }
            const { data: rows, error } = await q;
            if (error) throw new Error(error.message);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, operations: rows ?? [] }) });
          } else if (name === "delete_operation") {
            const parsed = z.object({ id: z.string().uuid() }).parse(args);
            const { error } = await supabaseAdmin.from("operations").delete().eq("id", parsed.id);
            if (error) throw new Error(error.message);
            executedActions.push({ tool: "delete_operation", service: "", amount: 0, barber: "", assistant: null, ok: true, error: null, id: parsed.id });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, deleted: parsed.id }) });
          } else if (name === "update_operation") {
            const parsed = z
              .object({
                id: z.string().uuid(),
                service: z.string().min(1).max(120).optional(),
                amount: z.number().nonnegative().max(1000000).optional(),
                barber: z.string().min(1).max(80).optional(),
                assistant: z.string().max(80).optional(),
                notes: z.string().max(500).optional(),
                branch: z.string().min(1).max(120).optional(),
              })
              .parse(args);
            const patch: {
              service?: string;
              amount?: number;
              barber?: string;
              assistant?: string | null;
              notes?: string | null;
              branch?: string;
            } = {};
            if (parsed.service !== undefined) patch.service = parsed.service;
            if (parsed.amount !== undefined) patch.amount = parsed.amount;
            if (parsed.barber !== undefined) patch.barber = normalizeBarber(parsed.barber);
            if (parsed.assistant !== undefined) patch.assistant = parsed.assistant;
            if (parsed.notes !== undefined) patch.notes = parsed.notes;
            if (parsed.branch !== undefined) patch.branch = parsed.branch;
            const { data: row, error } = await supabaseAdmin.from("operations").update(patch).eq("id", parsed.id).select().single();
            if (error) throw new Error(error.message);
            executedActions.push({
              tool: "update_operation",
              service: String(row?.service ?? ""),
              amount: Number(row?.amount ?? 0),
              barber: String(row?.barber ?? ""),
              assistant: row?.assistant ? String(row.assistant) : null,
              ok: true,
              error: null,
              id: parsed.id,
            });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, operation: row }) });
          } else if (name === "get_stats") {
            const parsedStats = z.object({ branch: z.string().max(120).optional() }).parse(args);
            const now = new Date();
            const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const bt = supabaseAdmin.from("operations").select("amount, barber, branch").gte("created_at", startToday);
            const bm = supabaseAdmin.from("operations").select("amount, barber, branch").gte("created_at", startMonth);
            const [t, m] = await Promise.all([
              parsedStats.branch ? bt.eq("branch", parsedStats.branch) : bt,
              parsedStats.branch ? bm.eq("branch", parsedStats.branch) : bm,
            ]);
            if (t.error) throw new Error(t.error.message);
            if (m.error) throw new Error(m.error.message);
            const dailyRevenue = (t.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
            const monthlyRevenue = (m.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
            const perBarber: Record<string, number> = {};
            for (const r of m.data ?? []) perBarber[r.barber] = (perBarber[r.barber] ?? 0) + Number(r.amount);
            const perBranch: Record<string, number> = {};
            for (const r of m.data ?? []) perBranch[r.branch] = (perBranch[r.branch] ?? 0) + Number(r.amount);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({
                ok: true,
                branch: parsedStats.branch ?? null,
                dailyRevenue,
                dailyOps: (t.data ?? []).length,
                monthlyRevenue,
                monthlyOps: (m.data ?? []).length,
                perBarberMonth: perBarber,
                perBranchMonth: perBranch,
              }),
            });
          } else if (name === "list_branches") {
            const { data: rows, error } = await supabaseAdmin.from("branches").select("*").order("created_at", { ascending: true });
            if (error) throw new Error(error.message);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, branches: rows ?? [] }) });
          } else if (name === "add_branch") {
            const parsed = z.object({ name: z.string().min(1).max(120), location: z.string().max(200).optional(), notes: z.string().max(500).optional() }).parse(args);
            const slug = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
            const { data: row, error } = await supabaseAdmin.from("branches").insert({ name: parsed.name, location: parsed.location ?? null, notes: parsed.notes ?? null, slug }).select().single();
            if (error) throw new Error(error.message);
            executedActions.push({ tool: "add_branch", service: parsed.name, amount: 0, barber: "", assistant: null, ok: true, error: null, id: row?.id ?? null });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, branch: row }) });
          } else {
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: "أداة غير معروفة" }) });
          }
        } catch (e) {
            const err = e instanceof Error ? e.message : "خطأ غير معروف";
            if (name === "add_operation" || name === "delete_operation" || name === "update_operation") {
              executedActions.push({
                tool: name,
                service: String(args.service ?? ""),
                amount: Number(args.amount ?? 0),
                barber: String(args.barber ?? ""),
                assistant: args.assistant ? String(args.assistant) : null,
                ok: false,
                error: err,
                id: args.id ? String(args.id) : null,
              });
            }
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: err }) });
        }
      }

      json = await callGateway({ ...body, messages }, apiKey);
      msg = json.choices?.[0]?.message;
    }

    const content = (msg?.content ?? "").trim();
    return { content, executedActions };
  });