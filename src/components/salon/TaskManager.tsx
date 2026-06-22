import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Paperclip, MessageSquare, Send, Upload, ChevronDown, ChevronUp, LogOut, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Comment = Database["public"]["Tables"]["task_comments"]["Row"];
type Attachment = Database["public"]["Tables"]["task_attachments"]["Row"];
type Branch = Database["public"]["Tables"]["external_branches"]["Row"];
type Priority = Database["public"]["Enums"]["task_priority"];
type Status = Database["public"]["Enums"]["task_status"];

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "منخفضة", color: "bg-blue-500/10 text-blue-400" },
  { value: "medium", label: "متوسطة", color: "bg-yellow-500/10 text-yellow-400" },
  { value: "high", label: "عالية", color: "bg-orange-500/10 text-orange-400" },
  { value: "urgent", label: "عاجل", color: "bg-red-500/10 text-red-400" },
];
const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: "pending", label: "في الانتظار", color: "bg-muted text-muted-foreground" },
  { value: "in_progress", label: "قيد التنفيذ", color: "bg-blue-500/10 text-blue-400" },
  { value: "completed", label: "مكتملة", color: "bg-green-500/10 text-green-400" },
  { value: "cancelled", label: "ملغاة", color: "bg-red-500/10 text-red-400" },
];

export function TaskManager() {
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [managedBranchIds, setManagedBranchIds] = useState<string[]>([]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    branch_id: "",
    priority: "medium" as Priority,
    due_date: "",
  });

  // Auth bootstrap
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.user;
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
      setAuthChecked(true);
      if (u) {
        const { data: owns } = await supabase
          .from("salons").select("id").eq("owner_id", u.id).limit(1);
        setIsOwner((owns?.length ?? 0) > 0);
        const { data: mng } = await supabase
          .from("external_branches").select("id").eq("manager_user_id", u.id);
        setManagedBranchIds((mng ?? []).map((r) => r.id));
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const u = s?.user;
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    const [t, b] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("external_branches").select("*").order("name"),
    ]);
    setTasks((t.data ?? []) as Task[]);
    setBranches((b.data ?? []) as Branch[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    loadAll();
    const ch = supabase
      .channel("tasks_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadAll())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.title.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      branch_id: form.branch_id || null,
      priority: form.priority,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      created_by: user.id,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setForm({ title: "", description: "", branch_id: "", priority: "medium", due_date: "" });
    setShowForm(false);
  }

  async function updateStatus(id: string, status: Status) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) alert(error.message);
  }

  async function deleteTask(id: string) {
    if (!confirm("حذف المهمة؟")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterBranch !== "all" && t.branch_id !== filterBranch) return false;
      return true;
    });
  }, [tasks, filterStatus, filterBranch]);

  if (!authChecked) {
    return <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!user) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <h2 className="text-lg font-bold">سجّل الدخول لإدارة المهام</h2>
        <p className="mt-1 text-sm text-muted-foreground">المهام والصلاحيات تحتاج حساب.</p>
        <a
          href="/auth"
          className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold"
          style={{ background: "var(--gradient-gold)", color: "#1a1500" }}
        >
          تسجيل الدخول
        </a>
      </div>
    );
  }

  const canCreate = isOwner;
  const branchName = (id: string | null) =>
    id ? branches.find((b) => b.id === id)?.name ?? "—" : "بدون فرع";

  return (
    <div className="space-y-4">
      <TaskStatsHeader tasks={tasks} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">إدارة المهام</h2>
          <div className="text-[10px] text-muted-foreground">
            {user.email} · {isOwner ? "مالك" : managedBranchIds.length ? "مدير فرع" : "مستخدم"}
          </div>
        </div>
        <div className="flex gap-2">
          {canCreate ? (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--gradient-gold)", color: "#1a1500" }}
            >
              <Plus className="h-3 w-3" />
              مهمة جديدة
            </button>
          ) : null}
          <button
            onClick={signOut}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
          >
            <LogOut className="h-3 w-3" />
            خروج
          </button>
        </div>
      </div>

      {showForm && canCreate ? (
        <form onSubmit={createTask} className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="عنوان المهمة"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="وصف (اختياري)"
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.branch_id}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">بدون فرع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <input
            type="datetime-local"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-lg py-2 text-sm font-semibold"
            style={{ background: "var(--gradient-gold)", color: "#1a1500" }}
          >
            إنشاء
          </button>
        </form>
      ) : null}

      <div className="flex gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as Status | "all")}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs"
        >
          <option value="all">كل الحالات</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={filterBranch}
          onChange={(e) => setFilterBranch(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs"
        >
          <option value="all">كل الفروع</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          لا توجد مهام
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              branchName={branchName(t.branch_id)}
              expanded={expandedId === t.id}
              onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
              onStatus={(s) => updateStatus(t.id, s)}
              onDelete={() => deleteTask(t.id)}
              canDelete={isOwner}
              userId={user.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskStatsHeader({ tasks }: { tasks: Task[] }) {
  const now = Date.now();
  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const overdue = tasks.filter(
    (t) => t.due_date && new Date(t.due_date).getTime() < now && t.status !== "completed" && t.status !== "cancelled",
  ).length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.filter((t) => t.status !== "cancelled").length;
  const rate = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Widget icon={<Clock className="h-3 w-3" />} label="معلقة" value={pending} tone="muted" />
      <Widget icon={<AlertTriangle className="h-3 w-3" />} label="متأخرة" value={overdue} tone="red" />
      <Widget icon={<CheckCircle2 className="h-3 w-3" />} label="مكتملة" value={completed} tone="green" />
      <Widget icon={<CheckCircle2 className="h-3 w-3" />} label="معدل الإنجاز" value={`${rate}%`} tone="gold" />
    </div>
  );
}

function Widget({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: "muted" | "red" | "green" | "gold" }) {
  const ring =
    tone === "red" ? "border-red-500/30" :
    tone === "green" ? "border-green-500/30" :
    tone === "gold" ? "border-[var(--gold)]/40" :
    "border-border";
  return (
    <div className={`rounded-2xl border ${ring} bg-card p-3`}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === "gold" ? "gold-text" : ""}`}>{value}</div>
    </div>
  );
}

function TaskCard({
  task, branchName, expanded, onToggle, onStatus, onDelete, canDelete, userId,
}: {
  task: Task;
  branchName: string;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (s: Status) => void;
  onDelete: () => void;
  canDelete: boolean;
  userId: string;
}) {
  const pri = PRIORITIES.find((p) => p.value === task.priority)!;
  const st = STATUSES.find((s) => s.value === task.status)!;
  const overdue =
    task.due_date &&
    new Date(task.due_date).getTime() < Date.now() &&
    task.status !== "completed" && task.status !== "cancelled";

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onToggle} className="min-w-0 flex-1 text-right">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[9px] ${pri.color}`}>{pri.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] ${st.color}`}>{st.label}</span>
            {overdue ? <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] text-red-400">متأخرة</span> : null}
          </div>
          <div className="mt-1 truncate font-bold">{task.title}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {branchName}
            {task.due_date ? ` · ${new Date(task.due_date).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}` : ""}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onToggle} className="rounded-full border border-border p-1.5 hover:bg-secondary">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {canDelete ? (
            <button onClick={onDelete} className="rounded-full border border-border p-1.5 hover:bg-secondary" title="حذف">
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {STATUSES.filter((s) => s.value !== task.status).map((s) => (
          <button
            key={s.value}
            onClick={() => onStatus(s.value)}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-secondary"
          >
            {s.label}
          </button>
        ))}
      </div>

      {expanded ? <TaskDetails task={task} userId={userId} /> : null}
    </div>
  );
}

function TaskDetails({ task, userId }: { task: Task; userId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    const [c, a] = await Promise.all([
      supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at"),
      supabase.from("task_attachments").select("*").eq("task_id", task.id).order("created_at"),
    ]);
    setComments((c.data ?? []) as Comment[]);
    setAttachments((a.data ?? []) as Attachment[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`task_${task.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${task.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments", filter: `task_id=eq.${task.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function addComment() {
    if (!newComment.trim()) return;
    const { error } = await supabase.from("task_comments").insert({
      task_id: task.id, user_id: userId, content: newComment.trim(),
    });
    if (error) alert(error.message);
    else setNewComment("");
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const path = `${task.id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("task-attachments").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("task_attachments").insert({
        task_id: task.id, file_path: path, file_name: file.name,
        file_size: file.size, mime_type: file.type, uploaded_by: userId,
      });
      if (error) throw error;
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر الرفع");
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function deleteAttachment(a: Attachment) {
    if (!confirm("حذف المرفق؟")) return;
    await supabase.storage.from("task-attachments").remove([a.file_path]);
    await supabase.from("task_attachments").delete().eq("id", a.id);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {task.description ? (
        <p className="rounded-lg bg-background/40 p-2 text-xs">{task.description}</p>
      ) : null}

      <div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
          <Paperclip className="h-3 w-3" /> المرفقات ({attachments.length})
        </div>
        <div className="mt-1 space-y-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/40 px-2 py-1 text-xs">
              <button onClick={() => openAttachment(a.file_path)} className="min-w-0 flex-1 truncate text-right hover:underline">
                {a.file_name}
              </button>
              <button onClick={() => deleteAttachment(a)} className="shrink-0 rounded p-1 hover:bg-secondary">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[10px] text-muted-foreground hover:bg-secondary">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            رفع ملف (إثبات إنجاز)
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
          <MessageSquare className="h-3 w-3" /> التعليقات ({comments.length})
        </div>
        <div className="mt-1 space-y-1">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-background/40 px-2 py-1 text-xs">
              <div className="text-foreground">{c.content}</div>
              <div className="text-[9px] text-muted-foreground">
                {new Date(c.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="اكتب تعليق..."
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          />
          <button
            onClick={addComment}
            className="rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-secondary"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}