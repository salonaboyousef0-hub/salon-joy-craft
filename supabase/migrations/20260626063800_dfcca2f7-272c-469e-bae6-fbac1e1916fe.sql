CREATE TABLE public.operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  barber TEXT NOT NULL,
  assistant TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX operations_created_at_idx ON public.operations (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations TO authenticated;
GRANT ALL ON public.operations TO service_role;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read operations" ON public.operations FOR SELECT USING (true);
CREATE POLICY "ops_insert" ON public.operations FOR INSERT WITH CHECK (true);
CREATE POLICY "ops_update" ON public.operations FOR UPDATE USING (true);
CREATE POLICY "ops_delete" ON public.operations FOR DELETE USING (true);
ALTER TABLE public.operations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.operations;
ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'صالون أبو يوسف – الفرع الرئيسي';
CREATE INDEX IF NOT EXISTS operations_branch_created_idx ON public.operations(branch, created_at DESC);

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  location text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO anon, authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "br_read" ON public.branches FOR SELECT USING (true);
CREATE POLICY "br_insert" ON public.branches FOR INSERT WITH CHECK (true);
CREATE POLICY "br_update" ON public.branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "br_delete" ON public.branches FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.branches;
ALTER TABLE public.branches REPLICA IDENTITY FULL;
INSERT INTO public.branches (name, location, notes) VALUES ('صالون أبو يوسف – الفرع الرئيسي', 'الفرع الأساسي', 'الفرع الرئيسي') ON CONFLICT (name) DO NOTHING;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS pin text;
UPDATE public.branches SET slug = lower(regexp_replace(encode(gen_random_bytes(4),'hex'),'[^a-z0-9]','','g')) WHERE slug IS NULL;
ALTER TABLE public.branches ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_unique ON public.branches(slug);

DO $$ BEGIN CREATE TYPE public.salon_role AS ENUM ('owner', 'manager'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.salons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'صالوني',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salons TO authenticated;
GRANT ALL ON public.salons TO service_role;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.salon_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.salon_role NOT NULL DEFAULT 'manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (salon_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_members TO authenticated;
GRANT ALL ON public.salon_members TO service_role;
ALTER TABLE public.salon_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_salon_ids(_user UUID) RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT salon_id FROM public.salon_members WHERE user_id = _user $$;
CREATE OR REPLACE FUNCTION public.is_salon_owner(_user UUID, _salon UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.salon_members WHERE user_id = _user AND salon_id = _salon AND role = 'owner') $$;
REVOKE EXECUTE ON FUNCTION public.user_salon_ids(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_salon_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_salon_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_salon_owner(UUID, UUID) TO authenticated;

CREATE POLICY "salons_read" ON public.salons FOR SELECT TO authenticated USING (id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "salons_upd" ON public.salons FOR UPDATE TO authenticated USING (public.is_salon_owner(auth.uid(), id));
CREATE POLICY "salons_ins" ON public.salons FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "sm_read" ON public.salon_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "sm_ins" ON public.salon_members FOR INSERT TO authenticated WITH CHECK (public.is_salon_owner(auth.uid(), salon_id) OR (user_id = auth.uid() AND role = 'owner'));
CREATE POLICY "sm_del" ON public.salon_members FOR DELETE TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id));

CREATE TABLE IF NOT EXISTS public.salon_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (salon_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_state TO authenticated;
GRANT ALL ON public.salon_state TO service_role;
ALTER TABLE public.salon_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ss_read" ON public.salon_state FOR SELECT TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "ss_ins" ON public.salon_state FOR INSERT TO authenticated WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "ss_upd" ON public.salon_state FOR UPDATE TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "ss_del" ON public.salon_state FOR DELETE TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));

CREATE OR REPLACE FUNCTION public.touch_salon_state() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at := now(); NEW.updated_by := auth.uid(); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.touch_salon_state() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_touch_salon_state BEFORE INSERT OR UPDATE ON public.salon_state FOR EACH ROW EXECUTE FUNCTION public.touch_salon_state();

CREATE TABLE IF NOT EXISTS public.salon_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  email text,
  role public.salon_role NOT NULL DEFAULT 'manager',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '')
);
CREATE INDEX IF NOT EXISTS salon_invites_email_idx ON public.salon_invites (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_invites TO authenticated;
GRANT ALL ON public.salon_invites TO service_role;
ALTER TABLE public.salon_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_read" ON public.salon_invites FOR SELECT TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "si_ins" ON public.salon_invites FOR INSERT TO authenticated WITH CHECK (public.is_salon_owner(auth.uid(), salon_id) AND created_by = auth.uid());
CREATE POLICY "si_del" ON public.salon_invites FOR DELETE TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id));

CREATE OR REPLACE FUNCTION public.get_invite_info(_token text) RETURNS TABLE(salon_id uuid, salon_name text, role public.salon_role, accepted boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT s.id, s.name, i.role, (i.accepted_at IS NOT NULL) FROM public.salon_invites i JOIN public.salons s ON s.id = i.salon_id WHERE i.token = _token LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.get_invite_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE invite_row public.salon_invites%ROWTYPE; new_salon_id uuid; invite_token text;
BEGIN
  invite_token := NEW.raw_user_meta_data->>'invite_token';
  IF invite_token IS NOT NULL AND length(invite_token) > 0 THEN
    SELECT * INTO invite_row FROM public.salon_invites WHERE token = invite_token AND accepted_at IS NULL LIMIT 1;
  END IF;
  IF invite_row.id IS NULL THEN
    SELECT * INTO invite_row FROM public.salon_invites WHERE email IS NOT NULL AND lower(email) = lower(NEW.email) AND accepted_at IS NULL ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF invite_row.id IS NOT NULL THEN
    INSERT INTO public.salon_members (salon_id, user_id, role) VALUES (invite_row.salon_id, NEW.id, invite_row.role) ON CONFLICT DO NOTHING;
    UPDATE public.salon_invites SET accepted_at = now() WHERE id = invite_row.id;
  ELSE
    INSERT INTO public.salons (owner_id, name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'salon_name', 'صالوني')) RETURNING id INTO new_salon_id;
    INSERT INTO public.salon_members (salon_id, user_id, role) VALUES (new_salon_id, NEW.id, 'owner');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE;
ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS branches_salon_id_idx ON public.branches(salon_id);
CREATE INDEX IF NOT EXISTS operations_salon_id_idx ON public.operations(salon_id);

ALTER TABLE public.salon_state REPLICA IDENTITY FULL;
ALTER TABLE public.salons REPLICA IDENTITY FULL;
ALTER TABLE public.salon_members REPLICA IDENTITY FULL;
ALTER TABLE public.salon_invites REPLICA IDENTITY FULL;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.salons; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_members; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_invites; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_state; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE public.external_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cashier_url TEXT,
  supabase_url TEXT NOT NULL,
  supabase_anon_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_branches TO anon, authenticated;
GRANT ALL ON public.external_branches TO service_role;
ALTER TABLE public.external_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eb_read" ON public.external_branches FOR SELECT USING (true);
CREATE POLICY "eb_ins" ON public.external_branches FOR INSERT WITH CHECK (true);
CREATE POLICY "eb_upd" ON public.external_branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "eb_del" ON public.external_branches FOR DELETE USING (true);
CREATE OR REPLACE FUNCTION public.touch_external_branches() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_external_branches BEFORE UPDATE ON public.external_branches FOR EACH ROW EXECUTE FUNCTION public.touch_external_branches();

CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','completed','cancelled');

ALTER TABLE public.external_branches ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_app_owner(_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.salons WHERE owner_id = _user) $$;
CREATE OR REPLACE FUNCTION public.is_branch_manager(_user uuid, _branch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.external_branches WHERE id = _branch AND manager_user_id = _user) $$;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  branch_id uuid REFERENCES public.external_branches(id) ON DELETE SET NULL,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'pending',
  due_date timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proof_url text,
  completed_at timestamptz,
  category text,
  assignee text,
  task_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_all" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS tasks_assignee_date_idx ON public.tasks(assignee, task_date);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tc_all" ON public.task_comments FOR ALL TO authenticated USING (true) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ta_all" ON public.task_attachments FOR ALL TO authenticated USING (true) WITH CHECK (uploaded_by = auth.uid());

CREATE TABLE public.task_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_notifications TO authenticated;
GRANT ALL ON public.task_notifications TO service_role;
ALTER TABLE public.task_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tn_all" ON public.task_notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_tasks_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tasks_touch_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.tasks_set_completed_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN NEW.completed_at = now();
  ELSIF NEW.status <> 'completed' THEN NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tasks_completed_at_trg BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_set_completed_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notifications;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

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
CREATE POLICY "ssd_all" ON public.salon_stats_daily FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_ssd_touch BEFORE UPDATE ON public.salon_stats_daily FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "exp_all" ON public.expenses FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_exp_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "emp_all" ON public.employees FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_emp_touch BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "svc_all" ON public.services FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_svc_touch BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "cli_all" ON public.clients FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_cli_touch BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  client_name TEXT, service_name TEXT, employee_name TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bk_all" ON public.bookings FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_bk_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "wd_all" ON public.withdrawals FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_wd_touch BEFORE UPDATE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "att_all" ON public.attendance FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_att_touch BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "sch_all" ON public.schedules FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_sch_touch BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "rt_read" ON public.revenue_targets FOR SELECT TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "rt_ins" ON public.revenue_targets FOR INSERT TO authenticated WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "rt_upd" ON public.revenue_targets FOR UPDATE TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id)) WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "rt_del" ON public.revenue_targets FOR DELETE TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id));
CREATE TRIGGER trg_rt_touch BEFORE UPDATE ON public.revenue_targets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "sw_read" ON public.staff_warnings FOR SELECT TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "sw_ins" ON public.staff_warnings FOR INSERT TO authenticated WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "sw_upd" ON public.staff_warnings FOR UPDATE TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id)) WITH CHECK (public.is_salon_owner(auth.uid(), salon_id));
CREATE POLICY "sw_del" ON public.staff_warnings FOR DELETE TO authenticated USING (public.is_salon_owner(auth.uid(), salon_id));
CREATE TRIGGER trg_sw_touch BEFORE UPDATE ON public.staff_warnings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "bk_all" ON public.branch_kpis FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_bk_touch BEFORE UPDATE ON public.branch_kpis FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "cl_all" ON public.checklists FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_cl_touch BEFORE UPDATE ON public.checklists FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "cli2_all" ON public.checklist_items FOR ALL TO authenticated USING (salon_id IN (SELECT public.user_salon_ids(auth.uid()))) WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE TRIGGER trg_cli2_touch BEFORE UPDATE ON public.checklist_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
CREATE POLICY "cm_read" ON public.chat_messages FOR SELECT TO authenticated USING (user_id = auth.uid() AND salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "cm_ins" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND salon_id IN (SELECT public.user_salon_ids(auth.uid())));
CREATE POLICY "cm_del" ON public.chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

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

CREATE INDEX idx_stats_salon_date ON public.salon_stats_daily(salon_id, stat_date DESC);
CREATE INDEX idx_expenses_salon_date ON public.expenses(salon_id, expense_date DESC);
CREATE INDEX idx_bookings_salon_time ON public.bookings(salon_id, scheduled_at);
CREATE INDEX idx_attendance_salon_date ON public.attendance(salon_id, attendance_date DESC);
CREATE INDEX idx_withdrawals_salon_date ON public.withdrawals(salon_id, withdrawal_date DESC);
CREATE INDEX idx_chat_salon_user ON public.chat_messages(salon_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('barber','assistant')),
  branch text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_employees TO anon, authenticated;
GRANT ALL ON public.ai_employees TO service_role;
ALTER TABLE public.ai_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_emp_all" ON public.ai_employees FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.ai_employees (name, role) VALUES ('مصطفى يوسف','barber'),('احمد ياسر','barber'),('عزت نصر','barber') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('barber','branch')),
  entity_name text NOT NULL,
  month text NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_targets_unique UNIQUE (entity_type, entity_name, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_targets TO anon, authenticated;
GRANT ALL ON public.ai_targets TO service_role;
ALTER TABLE public.ai_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_t_all" ON public.ai_targets FOR ALL USING (true) WITH CHECK (true);