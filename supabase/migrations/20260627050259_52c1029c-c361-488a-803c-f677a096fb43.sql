
-- Drop permissive policies
DROP POLICY IF EXISTS ai_emp_all ON public.ai_employees;
DROP POLICY IF EXISTS ai_t_all ON public.ai_targets;
DROP POLICY IF EXISTS br_delete ON public.branches;
DROP POLICY IF EXISTS br_insert ON public.branches;
DROP POLICY IF EXISTS br_read   ON public.branches;
DROP POLICY IF EXISTS br_update ON public.branches;
DROP POLICY IF EXISTS eb_del    ON public.external_branches;
DROP POLICY IF EXISTS eb_ins    ON public.external_branches;
DROP POLICY IF EXISTS eb_read   ON public.external_branches;
DROP POLICY IF EXISTS eb_upd    ON public.external_branches;
DROP POLICY IF EXISTS "Anyone can read operations" ON public.operations;
DROP POLICY IF EXISTS ops_delete ON public.operations;
DROP POLICY IF EXISTS ops_insert ON public.operations;
DROP POLICY IF EXISTS ops_update ON public.operations;
DROP POLICY IF EXISTS tasks_all  ON public.tasks;
DROP POLICY IF EXISTS ta_all     ON public.task_attachments;
DROP POLICY IF EXISTS tc_all     ON public.task_comments;

-- Revoke privileges from anon/authenticated; keep service_role
REVOKE ALL ON public.ai_employees, public.ai_targets, public.branches,
              public.external_branches, public.operations, public.tasks,
              public.task_attachments, public.task_comments
  FROM anon, authenticated;

GRANT ALL ON public.ai_employees, public.ai_targets, public.branches,
             public.external_branches, public.operations, public.tasks,
             public.task_attachments, public.task_comments
  TO service_role;

-- Revoke EXECUTE on SECURITY DEFINER helper functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.get_invite_info(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_salon_ids(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_salon_owner(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_app_owner(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_branch_manager(uuid, uuid) FROM anon, authenticated, PUBLIC;

-- Remove operations from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.operations;
