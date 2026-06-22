import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Resolve the caller's primary salon (first membership). Most users belong to one salon.
async function resolveSalonId(supabase: any, userId: string, override?: string) {
  if (override) return override;
  const { data, error } = await (supabase as any)
    .from("salon_members")
    .select("salon_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.salon_id) throw new Error("No salon membership found");
  return data.salon_id as string;
}

const Id = z.string().uuid();
const SalonOverride = z.object({ salonId: Id.optional() });

/* -------------------- STATS -------------------- */

export const getSalonStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({ days: z.number().int().min(1).max(366).default(60) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const salonId = await resolveSalonId(supabase, userId, data.salonId);
    const since = new Date(Date.now() - data.days * 86400000).toISOString().slice(0, 10);
    const { data: rows, error } = await (supabase as any)
      .from("salon_stats_daily").select("*")
      .eq("salon_id", salonId).gte("stat_date", since)
      .order("stat_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { stats: rows ?? [], salonId };
  });

export const upsertSalonStat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    stat_date: z.string().optional(),
    daily_revenue: z.number().nonnegative().optional(),
    daily_ops: z.number().int().nonnegative().optional(),
    monthly_net: z.number().optional(),
    expenses: z.number().nonnegative().optional(),
    pulse: z.number().int().min(0).max(100).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const salonId = await resolveSalonId(supabase, userId, data.salonId);
    const stat_date = data.stat_date ?? new Date().toISOString().slice(0, 10);
    const payload: any = { salon_id: salonId, stat_date };
    for (const k of ["daily_revenue","daily_ops","monthly_net","expenses","pulse"] as const) {
      if (data[k] !== undefined) payload[k] = data[k];
    }
    const { data: row, error } = await (supabase as any)
      .from("salon_stats_daily")
      .upsert(payload, { onConflict: "salon_id,stat_date" })
      .select().single();
    if (error) throw new Error(error.message);
    return { stat: row };
  });

/* -------------------- Generic CRUD factory -------------------- */

function makeList(table: string, orderBy = "created_at", asc = false) {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d: unknown) => SalonOverride.parse(d ?? {}))
    .handler(async ({ data, context }) => {
      const { supabase, userId } = context;
      const salonId = await resolveSalonId(supabase, userId, data.salonId);
      const { data: rows, error } = await (supabase as any)
        .from(table).select("*").eq("salon_id", salonId)
        .order(orderBy, { ascending: asc });
      if (error) throw new Error(error.message);
      return { rows: rows ?? [], salonId };
    });
}

function makeDelete(table: string) {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator(z.object({ id: Id }).parse)
    .handler(async ({ data, context }) => {
      const { error } = await (context.supabase as any).from(table).delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    });
}

/* -------------------- EXPENSES -------------------- */
export const listExpenses = makeList("expenses", "expense_date");
export const saveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    category: z.string().min(1).max(80),
    amount: z.number().nonnegative().max(1e9),
    note: z.string().max(500).optional().nullable(),
    expense_date: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId,
      category: data.category,
      amount: data.amount,
      note: data.note ?? null,
      expense_date: data.expense_date ?? new Date().toISOString().slice(0, 10),
      created_by: context.userId,
    };
    const q = data.id
      ? context.supabase.from("expenses").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("expenses").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteExpense = makeDelete("expenses");

/* -------------------- EMPLOYEES -------------------- */
export const listEmployees = makeList("employees", "name", true);
export const saveEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    name: z.string().min(1).max(120),
    role: z.string().max(80).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    active: z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId, name: data.name,
      role: data.role ?? null, phone: data.phone ?? null,
      active: data.active ?? true,
    };
    const q = data.id
      ? context.supabase.from("employees").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("employees").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteEmployee = makeDelete("employees");

/* -------------------- SERVICES -------------------- */
export const listServices = makeList("services", "name", true);
export const saveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    name: z.string().min(1).max(120),
    price: z.number().nonnegative().max(1e7),
    duration_min: z.number().int().min(1).max(1440).default(30),
    active: z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId, name: data.name, price: data.price,
      duration_min: data.duration_min, active: data.active ?? true,
    };
    const q = data.id
      ? context.supabase.from("services").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("services").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteService = makeDelete("services");

/* -------------------- CLIENTS -------------------- */
export const listClients = makeList("clients", "name", true);
export const saveClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    name: z.string().min(1).max(120),
    phone: z.string().max(40).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId, name: data.name,
      phone: data.phone ?? null, notes: data.notes ?? null,
      tags: data.tags ?? [],
    };
    const q = data.id
      ? context.supabase.from("clients").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("clients").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteClient = makeDelete("clients");

/* -------------------- BOOKINGS -------------------- */
export const listBookings = makeList("bookings", "scheduled_at", true);
export const saveBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    client_id: Id.nullable().optional(),
    service_id: Id.nullable().optional(),
    employee_id: Id.nullable().optional(),
    client_name: z.string().max(120).optional().nullable(),
    service_name: z.string().max(120).optional().nullable(),
    employee_name: z.string().max(120).optional().nullable(),
    scheduled_at: z.string().datetime(),
    status: z.enum(["pending","confirmed","done","cancelled","no_show"]).default("pending"),
    notes: z.string().max(500).optional().nullable(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId,
      client_id: data.client_id ?? null,
      service_id: data.service_id ?? null,
      employee_id: data.employee_id ?? null,
      client_name: data.client_name ?? null,
      service_name: data.service_name ?? null,
      employee_name: data.employee_name ?? null,
      scheduled_at: data.scheduled_at,
      status: data.status,
      notes: data.notes ?? null,
    };
    const q = data.id
      ? context.supabase.from("bookings").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("bookings").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteBooking = makeDelete("bookings");

/* -------------------- WITHDRAWALS -------------------- */
export const listWithdrawals = makeList("withdrawals", "withdrawal_date");
export const saveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    employee_id: Id.nullable().optional(),
    employee_name: z.string().max(120).optional().nullable(),
    amount: z.number().nonnegative().max(1e7),
    reason: z.string().max(500).optional().nullable(),
    withdrawal_date: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId,
      employee_id: data.employee_id ?? null,
      employee_name: data.employee_name ?? null,
      amount: data.amount, reason: data.reason ?? null,
      withdrawal_date: data.withdrawal_date ?? new Date().toISOString().slice(0, 10),
    };
    const q = data.id
      ? context.supabase.from("withdrawals").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("withdrawals").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteWithdrawal = makeDelete("withdrawals");

/* -------------------- ATTENDANCE -------------------- */
export const listAttendance = makeList("attendance", "attendance_date");
export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    employee_id: Id.nullable().optional(),
    employee_name: z.string().max(120).optional().nullable(),
    attendance_date: z.string().optional(),
    status: z.enum(["present","absent","late","leave"]).default("present"),
    check_in: z.string().datetime().nullable().optional(),
    check_out: z.string().datetime().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId,
      employee_id: data.employee_id ?? null,
      employee_name: data.employee_name ?? null,
      attendance_date: data.attendance_date ?? new Date().toISOString().slice(0, 10),
      status: data.status,
      check_in: data.check_in ?? null,
      check_out: data.check_out ?? null,
    };
    const q = data.id
      ? context.supabase.from("attendance").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("attendance").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteAttendance = makeDelete("attendance");

/* -------------------- SCHEDULES (weekly grid) -------------------- */
export const listSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SalonOverride.extend({ week_start: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    let q = context.supabase.from("schedules").select("*").eq("salon_id", salonId);
    if (data.week_start) q = q.eq("week_start", data.week_start);
    const { data: rows, error } = await q.order("employee_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], salonId };
  });

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    week_start: z.string(),
    day_name: z.string().min(1).max(20),
    employee_name: z.string().min(1).max(120),
    shift: z.string().max(40),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const { data: row, error } = await context.supabase.from("schedules")
      .upsert({
        salon_id: salonId, week_start: data.week_start,
        day_name: data.day_name, employee_name: data.employee_name,
        shift: data.shift,
      }, { onConflict: "salon_id,week_start,day_name,employee_name" })
      .select().single();
    if (error) throw new Error(error.message);
    return { row };
  });

/* -------------------- REVENUE TARGETS (owner only via RLS) -------------------- */
export const listRevenueTargets = makeList("revenue_targets", "target_month");
export const saveRevenueTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    branch: z.string().max(120).optional().nullable(),
    target_month: z.string(),
    target_amount: z.number().nonnegative().max(1e9),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const { data: row, error } = await context.supabase.from("revenue_targets")
      .upsert({
        salon_id: salonId, branch: data.branch ?? null,
        target_month: data.target_month, target_amount: data.target_amount,
      }, { onConflict: "salon_id,branch,target_month" })
      .select().single();
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteRevenueTarget = makeDelete("revenue_targets");

/* -------------------- STAFF WARNINGS (owner only via RLS) -------------------- */
export const listStaffWarnings = makeList("staff_warnings", "warning_date");
export const saveStaffWarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    staff: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
    warning_date: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId, staff: data.staff, reason: data.reason,
      warning_date: data.warning_date ?? new Date().toISOString().slice(0, 10),
    };
    const q = data.id
      ? context.supabase.from("staff_warnings").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("staff_warnings").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteStaffWarning = makeDelete("staff_warnings");

/* -------------------- BRANCH KPIs -------------------- */
export const listBranchKpis = makeList("branch_kpis", "recorded_at");
export const saveBranchKpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    branch: z.string().max(120).optional().nullable(),
    metric: z.string().min(1).max(80),
    value: z.number().max(1e12),
    period: z.enum(["daily","weekly","monthly","yearly"]).default("monthly"),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = {
      salon_id: salonId, branch: data.branch ?? null,
      metric: data.metric, value: data.value, period: data.period,
    };
    const q = data.id
      ? context.supabase.from("branch_kpis").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("branch_kpis").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteBranchKpi = makeDelete("branch_kpis");

/* -------------------- CHECKLISTS -------------------- */
export const listChecklists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SalonOverride.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const { data: lists, error } = await context.supabase.from("checklists")
      .select("*, items:checklist_items(*)")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { lists: lists ?? [] };
  });

export const saveChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(), title: z.string().min(1).max(200),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload = { salon_id: salonId, title: data.title };
    const q = data.id
      ? context.supabase.from("checklists").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("checklists").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteChecklist = makeDelete("checklists");

export const saveChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    id: Id.optional(),
    checklist_id: Id,
    label: z.string().min(1).max(300),
    done: z.boolean().optional(),
    position: z.number().int().min(0).max(10000).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const payload: any = {
      salon_id: salonId, checklist_id: data.checklist_id, label: data.label,
    };
    if (data.done !== undefined) payload.done = data.done;
    if (data.position !== undefined) payload.position = data.position;
    const q = data.id
      ? context.supabase.from("checklist_items").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("checklist_items").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { row };
  });
export const deleteChecklistItem = makeDelete("checklist_items");

/* -------------------- CHAT MESSAGES -------------------- */
export const listChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SalonOverride.extend({ limit: z.number().int().min(1).max(500).default(200) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const { data: rows, error } = await context.supabase.from("chat_messages")
      .select("*").eq("salon_id", salonId)
      .order("created_at", { ascending: true }).limit(data.limit);
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

export const appendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(SalonOverride.extend({
    role: z.enum(["user","assistant","system"]),
    content: z.string().min(1).max(8000),
  }).parse)
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const { data: row, error } = await context.supabase.from("chat_messages")
      .insert({ salon_id: salonId, user_id: context.userId, role: data.role, content: data.content })
      .select().single();
    if (error) throw new Error(error.message);
    return { message: row };
  });

export const clearChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SalonOverride.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId, data.salonId);
    const { error } = await context.supabase.from("chat_messages").delete().eq("salon_id", salonId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Resolve current salon (utility for clients) -------------------- */
export const getMySalon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const salonId = await resolveSalonId(context.supabase, context.userId);
    const { data: salon } = await context.supabase.from("salons").select("*").eq("id", salonId).maybeSingle();
    return { salonId, salon };
  });