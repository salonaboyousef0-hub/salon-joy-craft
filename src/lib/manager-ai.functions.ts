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
  {
    type: "function" as const,
    function: {
      name: "list_employees",
      description: "جيب الموظفين النشطين (الحلاقين والمساعدين) من قاعدة بيانات المدير. فلتر اختياري role=barber|assistant، branch.",
      parameters: { type: "object", properties: { role: { type: "string" }, branch: { type: "string" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_target",
      description: "حدد/حدّث تارجت شهري لحلاق أو فرع. month بصيغة YYYY-MM. يعمل upsert على (entity_type, entity_name, month).",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", description: "barber أو branch" },
          entity_name: { type: "string" },
          month: { type: "string", description: "YYYY-MM" },
          target_amount: { type: "number" },
        },
        required: ["entity_type", "entity_name", "month", "target_amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_targets",
      description: "اقرأ التارجتات للشهر مع الإيراد الفعلي ونسبة الإنجاز %. لو ما مرّرتش month يستخدم الشهر الحالي.",
      parameters: { type: "object", properties: { month: { type: "string" }, entity_type: { type: "string" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_task",
      description: "أضف مهمة يومية لموظف. category: نظافة|متابعة|عمليات|تطوير|أخرى. priority: high|medium|low. task_date افتراضي اليوم.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          assignee: { type: "string" },
          priority: { type: "string" },
          task_date: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
        },
        required: ["title", "assignee"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "اقرأ مهام اليوم (افتراضياً) مع فلاتر assignee/status. status: pending|done|cancelled.",
      parameters: { type: "object", properties: { assignee: { type: "string" }, status: { type: "string" }, task_date: { type: "string" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete_task",
      description: "علّم مهمة كمنفّذة (done) أو ملغية (cancelled).",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, status: { type: "string", description: "done أو cancelled" } },
        required: ["id"],
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
          } else if (name === "list_employees") {
            const p = z.object({ role: z.string().optional(), branch: z.string().optional() }).parse(args);
            let q = supabaseAdmin.from("ai_employees" as any).select("*").eq("active", true);
            if (p.role) q = q.eq("role", p.role);
            if (p.branch) q = q.eq("branch", p.branch);
            const { data: rows, error } = await q;
            if (error) throw new Error(error.message);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, employees: rows ?? [] }) });
          } else if (name === "set_target") {
            const p = z.object({
              entity_type: z.enum(["barber", "branch"]),
              entity_name: z.string().min(1).max(120),
              month: z.string().regex(/^\d{4}-\d{2}$/),
              target_amount: z.number().nonnegative().max(100000000),
            }).parse(args);
            const { data: row, error } = await supabaseAdmin
              .from("ai_targets" as any)
              .upsert({ entity_type: p.entity_type, entity_name: p.entity_name, month: p.month, target_amount: p.target_amount, updated_at: new Date().toISOString() }, { onConflict: "entity_type,entity_name,month" })
              .select()
              .single();
            if (error) throw new Error(error.message);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, target: row }) });
          } else if (name === "get_targets") {
            const p = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional(), entity_type: z.string().optional() }).parse(args);
            const now = new Date();
            const month = p.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            let tq = supabaseAdmin.from("ai_targets" as any).select("*").eq("month", month);
            if (p.entity_type) tq = tq.eq("entity_type", p.entity_type);
            const { data: targets, error: terr } = await tq;
            if (terr) throw new Error(terr.message);
            const [y, m] = month.split("-").map(Number);
            const startMonth = new Date(y, m - 1, 1).toISOString();
            const endMonth = new Date(y, m, 1).toISOString();
            const { data: ops, error: oerr } = await supabaseAdmin.from("operations").select("amount, barber, branch").gte("created_at", startMonth).lt("created_at", endMonth);
            if (oerr) throw new Error(oerr.message);
            const byBarber: Record<string, number> = {};
            const byBranch: Record<string, number> = {};
            for (const r of ops ?? []) {
              byBarber[r.barber] = (byBarber[r.barber] ?? 0) + Number(r.amount);
              byBranch[r.branch] = (byBranch[r.branch] ?? 0) + Number(r.amount);
            }
            const enriched = (targets ?? []).map((t: any) => {
              const actual = t.entity_type === "barber" ? (byBarber[t.entity_name] ?? 0) : (byBranch[t.entity_name] ?? 0);
              const target = Number(t.target_amount) || 0;
              const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
              return { ...t, actual, achievement_pct: pct };
            });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, month, targets: enriched }) });
          } else if (name === "add_task") {
            const p = z.object({
              title: z.string().min(1).max(300),
              category: z.string().max(60).optional(),
              assignee: z.string().min(1).max(120),
              priority: z.enum(["high", "medium", "low"]).optional(),
              task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
              notes: z.string().max(2000).optional(),
            }).parse(args);
            const today = new Date().toISOString().slice(0, 10);
            const prMap: Record<string, string> = { high: "high", medium: "medium", low: "low" };
            const { data: row, error } = await supabaseAdmin
              .from("tasks")
              .insert({
                title: p.title,
                category: p.category ?? null,
                assignee: p.assignee,
                priority: (prMap[p.priority ?? "medium"] as any),
                status: "pending" as any,
                task_date: p.task_date ?? today,
                notes: p.notes ?? null,
              } as any)
              .select()
              .single();
            if (error) throw new Error(error.message);
            executedActions.push({ tool: "add_task", service: p.title, amount: 0, barber: "", assistant: p.assignee, ok: true, error: null, id: (row as any)?.id ?? null });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, task: row }) });
          } else if (name === "list_tasks") {
            const p = z.object({ assignee: z.string().optional(), status: z.string().optional(), task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(args);
            const today = new Date().toISOString().slice(0, 10);
            let q = supabaseAdmin.from("tasks").select("id, title, category, assignee, priority, status, task_date, notes, created_at").eq("task_date", p.task_date ?? today).order("created_at", { ascending: false });
            if (p.assignee) q = q.eq("assignee", p.assignee);
            if (p.status) {
              const dbStatus = p.status === "done" ? "completed" : p.status;
              q = q.eq("status", dbStatus as any);
            }
            const { data: rows, error } = await q;
            if (error) throw new Error(error.message);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, tasks: rows ?? [] }) });
          } else if (name === "complete_task") {
            const p = z.object({ id: z.string().uuid(), status: z.enum(["done", "cancelled"]).default("done") }).parse(args);
            const dbStatus = p.status === "done" ? "completed" : "cancelled";
            const { data: row, error } = await supabaseAdmin.from("tasks").update({ status: dbStatus as any }).eq("id", p.id).select().single();
            if (error) throw new Error(error.message);
            executedActions.push({ tool: "complete_task", service: "", amount: 0, barber: "", assistant: null, ok: true, error: null, id: p.id });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, task: row }) });
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