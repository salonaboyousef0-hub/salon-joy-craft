
-- Enums
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','completed','cancelled');

-- Link branch to manager user
ALTER TABLE public.external_branches
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Helper: is user an owner (owns any salon)
CREATE OR REPLACE FUNCTION public.is_app_owner(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.salons WHERE owner_id = _user)
$$;

-- Helper: is user the manager of a branch
CREATE OR REPLACE FUNCTION public.is_branch_manager(_user uuid, _branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.external_branches WHERE id = _branch AND manager_user_id = _user)
$$;

-- tasks
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks owner all" ON public.tasks FOR ALL TO authenticated
  USING (public.is_app_owner(auth.uid()))
  WITH CHECK (public.is_app_owner(auth.uid()));
CREATE POLICY "tasks manager select" ON public.tasks FOR SELECT TO authenticated
  USING (branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), branch_id));
CREATE POLICY "tasks manager update" ON public.tasks FOR UPDATE TO authenticated
  USING (branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), branch_id));

-- task_comments
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

CREATE POLICY "comments select visible" ON public.task_comments FOR SELECT TO authenticated
  USING (EXISTS(
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
      public.is_app_owner(auth.uid())
      OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
    )
  ));
CREATE POLICY "comments insert own" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS(
      SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
        public.is_app_owner(auth.uid())
        OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
      )
    )
  );
CREATE POLICY "comments delete own or owner" ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_app_owner(auth.uid()));

-- task_attachments
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

CREATE POLICY "attachments select visible" ON public.task_attachments FOR SELECT TO authenticated
  USING (EXISTS(
    SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
      public.is_app_owner(auth.uid())
      OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
    )
  ));
CREATE POLICY "attachments insert own" ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS(
      SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
        public.is_app_owner(auth.uid())
        OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
      )
    )
  );
CREATE POLICY "attachments delete own or owner" ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_app_owner(auth.uid()));

-- task_notifications
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

CREATE POLICY "notifications own all" ON public.task_notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Triggers
CREATE OR REPLACE FUNCTION public.touch_tasks_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tasks_touch_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.tasks_set_completed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tasks_completed_at_trg BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_set_completed_at();

CREATE OR REPLACE FUNCTION public.notify_task_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mgr uuid; o RECORD;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT manager_user_id INTO mgr FROM public.external_branches WHERE id = NEW.branch_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF mgr IS NOT NULL THEN
      INSERT INTO public.task_notifications(user_id, task_id, type, message)
      VALUES (mgr, NEW.id, 'assigned', 'مهمة جديدة: ' || NEW.title);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    FOR o IN SELECT owner_id FROM public.salons LOOP
      INSERT INTO public.task_notifications(user_id, task_id, type, message)
      VALUES (o.owner_id, NEW.id, 'status_change', 'تحديث: ' || NEW.title || ' → ' || NEW.status::text);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tasks_notify_trg AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notifications;
