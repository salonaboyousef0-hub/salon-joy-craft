
-- Helper: shared updated_at trigger fn (idempotent)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Generic macro pattern via repeated SQL. Each table: salon_id FK, timestamps, RLS by membership.

-- 1) salon_stats_daily
CREATE TABLE public.salon_stats_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  daily_ops INTEGER NOT NULL DEFAULT 0,
  monthly_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  pulse INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(salon_id, stat_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_stats_daily TO authenticated;
GRANT ALL ON public.salon_stats_daily TO service_role;
ALTER TABLE public.salon_stats_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage stats" ON public.salon_stats_daily FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_salon_stats_daily_touch BEFORE UPDATE ON public.salon_stats_daily
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_expenses_touch BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage employees" ON public.employees FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_employees_touch BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage services" ON public.services FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_services_touch BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage clients" ON public.clients FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  client_name TEXT,
  service_name TEXT,
  employee_name TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage bookings" ON public.bookings FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_bookings_touch BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7) withdrawals
CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT,
  withdrawal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage withdrawals" ON public.withdrawals FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_withdrawals_touch BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8) attendance
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name TEXT,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'present',
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage attendance" ON public.attendance FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_attendance_touch BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9) schedules (weekly grid cells)
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_name TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  shift TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(salon_id, week_start, day_name, employee_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage schedules" ON public.schedules FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_schedules_touch BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 10) revenue_targets (owner only writes)
CREATE TABLE public.revenue_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  branch TEXT,
  target_month DATE NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(salon_id, branch, target_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_targets TO authenticated;
GRANT ALL ON public.revenue_targets TO service_role;
ALTER TABLE public.revenue_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read targets" ON public.revenue_targets FOR SELECT TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "owners write targets" ON public.revenue_targets FOR INSERT TO authenticated
  WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "owners update targets" ON public.revenue_targets FOR UPDATE TO authenticated
  USING (public.is_salon_owner(auth.uid(), salon_id))
  WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "owners delete targets" ON public.revenue_targets FOR DELETE TO authenticated
  USING (public.is_salon_owner(auth.uid(), salon_id));
CREATE TRIGGER trg_revenue_targets_touch BEFORE UPDATE ON public.revenue_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 11) staff_warnings (owner only writes)
CREATE TABLE public.staff_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  staff TEXT NOT NULL,
  reason TEXT NOT NULL,
  warning_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_warnings TO authenticated;
GRANT ALL ON public.staff_warnings TO service_role;
ALTER TABLE public.staff_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read warnings" ON public.staff_warnings FOR SELECT TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "owners write warnings" ON public.staff_warnings FOR INSERT TO authenticated
  WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "owners update warnings" ON public.staff_warnings FOR UPDATE TO authenticated
  USING (public.is_salon_owner(auth.uid(), salon_id))
  WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "owners delete warnings" ON public.staff_warnings FOR DELETE TO authenticated
  USING (public.is_salon_owner(auth.uid(), salon_id));
CREATE TRIGGER trg_staff_warnings_touch BEFORE UPDATE ON public.staff_warnings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 12) branch_kpis
CREATE TABLE public.branch_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  branch TEXT,
  metric TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_kpis TO authenticated;
GRANT ALL ON public.branch_kpis TO service_role;
ALTER TABLE public.branch_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage kpis" ON public.branch_kpis FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_branch_kpis_touch BEFORE UPDATE ON public.branch_kpis
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 13) checklists + items
CREATE TABLE public.checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage checklists" ON public.checklists FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_checklists_touch BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage checklist_items" ON public.checklist_items FOR ALL TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())))
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_checklist_items_touch BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 14) chat_messages (per-user history scoped to salon)
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat read" ON public.chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "own chat write" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "own chat delete" ON public.chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime on all new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_stats_daily;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.revenue_targets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_warnings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_kpis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Indexes
CREATE INDEX idx_stats_salon_date ON public.salon_stats_daily(salon_id, stat_date DESC);
CREATE INDEX idx_expenses_salon_date ON public.expenses(salon_id, expense_date DESC);
CREATE INDEX idx_bookings_salon_time ON public.bookings(salon_id, scheduled_at);
CREATE INDEX idx_attendance_salon_date ON public.attendance(salon_id, attendance_date DESC);
CREATE INDEX idx_withdrawals_salon_date ON public.withdrawals(salon_id, withdrawal_date DESC);
CREATE INDEX idx_chat_salon_user ON public.chat_messages(salon_id, user_id, created_at DESC);
