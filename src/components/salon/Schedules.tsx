import { useServerFn } from "@tanstack/react-start";
import { BARBERS, ASSISTANTS } from "@/lib/salon-data";
import { DAYS, type ScheduleCell } from "./storage";
import {
  listSchedules,
  upsertSchedule,
  listRevenueTargets,
  saveRevenueTarget,
  listStaffWarnings,
  saveStaffWarning,
  deleteStaffWarning,
  listBranchKpis,
  saveBranchKpi,
} from "@/lib/salon-data.functions";
import {
  useSalonList,
  useInvalidator,
  currentWeekStart,
  currentMonthStart,
} from "./useSalonData";

const CYCLE: ScheduleCell[] = ["", "صباحي", "مسائي", "كامل", "إجازة"];
const CELL_STYLE: Record<ScheduleCell, string> = {
  "": "bg-background text-muted-foreground",
  "صباحي": "bg-yellow-500/15 text-yellow-300",
  "مسائي": "bg-blue-500/15 text-blue-300",
  "كامل": "bg-emerald-500/15 text-emerald-300",
  "إجازة": "bg-red-500/15 text-red-300",
};

const ALL_STAFF = [...BARBERS.map((b) => b.name), ...ASSISTANTS.map((a) => a.name)];

export function Schedules() {
  const week = currentWeekStart();
  const month = currentMonthStart();
  const invalidate = useInvalidator();

  const schedKey = ["salon", "schedules", week];
  const tgtKey = ["salon", "revenue_targets", month];
  const warnKey = ["salon", "staff_warnings"];
  const kpiKey = ["salon", "branch_kpis", month];

  const schedQ = useSalonList<{ rows: any[] }>("schedules", schedKey, listSchedules, { week_start: week });
  const tgtQ = useSalonList<{ rows: any[] }>("revenue_targets", tgtKey, listRevenueTargets);
  const warnQ = useSalonList<{ rows: any[] }>("staff_warnings", warnKey, listStaffWarnings);
  const kpiQ = useSalonList<{ rows: any[] }>("branch_kpis", kpiKey, listBranchKpis);

  const upsertSched = useServerFn(upsertSchedule);
  const saveTgt = useServerFn(saveRevenueTarget);
  const saveWarn = useServerFn(saveStaffWarning);
  const delWarn = useServerFn(deleteStaffWarning);
  const saveKpi = useServerFn(saveBranchKpi);

  // Build map: schedule[staff][day] = shift
  const schedule: Record<string, Record<string, ScheduleCell>> = {};
  for (const r of schedQ.data?.rows ?? []) {
    schedule[r.employee_name] = schedule[r.employee_name] ?? {};
    schedule[r.employee_name][r.day_name] = (r.shift || "") as ScheduleCell;
  }

  // targets: by employee name (using "branch" column as staff name)
  const targets: Record<string, number> = {};
  for (const t of tgtQ.data?.rows ?? []) {
    if (t.target_month === month && t.branch) targets[t.branch] = Number(t.target_amount) || 0;
  }

  // actual: branch_kpis where metric = "actual:<name>" this month
  const actual: Record<string, number> = {};
  for (const k of kpiQ.data?.rows ?? []) {
    if (k.metric?.startsWith("actual:")) actual[k.metric.slice(7)] = Number(k.value) || 0;
  }

  // warnings from DB
  const warnings = (warnQ.data?.rows ?? []).map((w) => ({
    id: w.id as string,
    staff: w.staff as string,
    reason: w.reason as string,
    date: new Date(w.warning_date).toLocaleDateString("ar-EG"),
  }));

  async function cycle(staff: string, day: string) {
    const cur = schedule[staff]?.[day] ?? "";
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    await upsertSched({
      data: { week_start: week, day_name: day, employee_name: staff, shift: next || "" },
    });
    invalidate([schedKey]);
  }

  async function addWarning(staff: string) {
    const reason = window.prompt(`سبب الإنذار لـ ${staff}؟`);
    if (!reason) return;
    await saveWarn({ data: { staff, reason } });
    invalidate([warnKey]);
  }

  async function setTarget(name: string, value: number) {
    await saveTgt({ data: { branch: name, target_month: month, target_amount: value } });
    invalidate([tgtKey]);
  }

  async function setActualKpi(name: string, value: number) {
    // Find existing kpi for this month
    const existing = (kpiQ.data?.rows ?? []).find(
      (k) => k.metric === `actual:${name}` && new Date(k.recorded_at).toISOString().slice(0, 7) === month.slice(0, 7),
    );
    await saveKpi({
      data: {
        id: existing?.id,
        metric: `actual:${name}`,
        value,
        period: "monthly",
      },
    });
    invalidate([kpiKey]);
  }

  async function removeWarning(id: string) {
    await delWarn({ data: { id } });
    invalidate([warnKey]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-lg font-bold">جدول الأسبوع</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-right">الموظف</th>
                {DAYS.map((d) => (
                  <th key={d} className="p-2 text-center font-normal">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_STAFF.map((s) => (
                <tr key={s} className="border-b border-border/50 last:border-0">
                  <td className="p-2 text-right font-semibold">{s}</td>
                  {DAYS.map((d) => {
                    const v = schedule[s]?.[d] ?? "";
                    return (
                      <td key={d} className="p-1.5 text-center">
                        <button
                          onClick={() => cycle(s, d)}
                          className={`w-full rounded-lg px-1.5 py-2 text-[11px] font-semibold transition ${CELL_STYLE[v]}`}
                        >
                          {v || "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">اضغط على الخانة لتدوير: صباحي → مسائي → كامل → إجازة.</p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">الأهداف الأسبوعية والحوافز</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {BARBERS.map((b) => {
            const target = targets[b.name] ?? 0;
            const real = actual[b.name] ?? 0;
            const pct = target > 0 ? Math.round((real / target) * 100) : 0;
            const tag = pct >= 120 ? "🎁 يستاهل بونص" : pct >= 100 ? "✅ حقق الهدف" : pct >= 70 ? "⏳ تحت الهدف" : "⚠️ ضعيف";
            return (
              <div key={b.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground">نسبة {b.commission}%</div>
                  </div>
                  <div className="text-xs font-semibold text-[var(--gold)]">{tag}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <label className="block">
                    <span className="text-muted-foreground">الهدف</span>
                    <input
                      value={target}
                      onChange={(e) => setTarget(b.name, Number(e.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 outline-none"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">المُحقق</span>
                    <input
                      value={real}
                      onChange={(e) => setActualKpi(b.name, Number(e.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1 outline-none"
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full"
                    style={{ width: `${Math.min(pct, 140)}%`, background: "var(--gradient-gold)" }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">{pct}% من الهدف</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">نظام الإنذارات</h2>
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {ALL_STAFF.map((s) => {
              const count = warnings.filter((w) => w.staff === s).length;
              return (
                <button
                  key={s}
                  onClick={() => addWarning(s)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    count >= 3 ? "border-red-500 text-red-400" : count > 0 ? "border-yellow-500 text-yellow-300" : "border-border"
                  }`}
                >
                  {s} {count > 0 ? `(${count})` : ""}
                </button>
              );
            })}
          </div>
          {warnings.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">مفيش إنذارات. اضغط اسم الموظف لتسجيل إنذار.</div>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {warnings.slice().reverse().map((w) => (
                <li key={w.id} className="flex items-center justify-between rounded-lg border border-border bg-background/50 p-2">
                  <div>
                    <span className="font-semibold">{w.staff}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span>{w.reason}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{w.date}</span>
                    <button
                      onClick={() => removeWarning(w.id)}
                      className="text-red-400 hover:underline"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">3 إنذارات = خصم تلقائي.</p>
        </div>
      </div>
    </div>
  );
}