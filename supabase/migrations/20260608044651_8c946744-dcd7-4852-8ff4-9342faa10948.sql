
-- ============================================================
-- Stage 1: Extend Project A schema with Project B structures
-- No data is moved or deleted in this stage.
-- ============================================================

-- 1) Enum
DO $$ BEGIN
  CREATE TYPE public.salon_role AS ENUM ('owner', 'manager');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) salons
CREATE TABLE IF NOT EXISTS public.salons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'صالوني',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salons TO authenticated;
GRANT ALL ON public.salons TO service_role;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

-- 3) salon_members
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

-- 4) Helper functions (SECURITY DEFINER, locked down)
CREATE OR REPLACE FUNCTION public.user_salon_ids(_user UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT salon_id FROM public.salon_members WHERE user_id = _user
$$;

CREATE OR REPLACE FUNCTION public.is_salon_owner(_user UUID, _salon UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.salon_members
    WHERE user_id = _user AND salon_id = _salon AND role = 'owner'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.user_salon_ids(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_salon_owner(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_salon_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_salon_owner(UUID, UUID) TO authenticated;

-- 5) Policies for salons
DROP POLICY IF EXISTS "members read their salons" ON public.salons;
CREATE POLICY "members read their salons" ON public.salons
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_salon_ids(auth.uid())));

DROP POLICY IF EXISTS "owner updates salon" ON public.salons;
CREATE POLICY "owner updates salon" ON public.salons
  FOR UPDATE TO authenticated
  USING (public.is_salon_owner(auth.uid(), id));

DROP POLICY IF EXISTS "user creates own salon" ON public.salons;
CREATE POLICY "user creates own salon" ON public.salons
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- 6) Policies for salon_members
DROP POLICY IF EXISTS "read own membership" ON public.salon_members;
CREATE POLICY "read own membership" ON public.salon_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_salon_owner(auth.uid(), salon_id));

DROP POLICY IF EXISTS "owner adds members" ON public.salon_members;
CREATE POLICY "owner adds members" ON public.salon_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_salon_owner(auth.uid(), salon_id) OR (user_id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "owner removes members" ON public.salon_members;
CREATE POLICY "owner removes members" ON public.salon_members
  FOR DELETE TO authenticated
  USING (public.is_salon_owner(auth.uid(), salon_id));

-- 7) salon_state (key/value JSON store, mirrors Project B exactly)
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

DROP POLICY IF EXISTS "members read salon state" ON public.salon_state;
CREATE POLICY "members read salon state" ON public.salon_state
  FOR SELECT TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));

DROP POLICY IF EXISTS "members write salon state" ON public.salon_state;
CREATE POLICY "members write salon state" ON public.salon_state
  FOR INSERT TO authenticated
  WITH CHECK (salon_id IN (SELECT public.user_salon_ids(auth.uid())));

DROP POLICY IF EXISTS "members update salon state" ON public.salon_state;
CREATE POLICY "members update salon state" ON public.salon_state
  FOR UPDATE TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));

DROP POLICY IF EXISTS "members delete salon state" ON public.salon_state;
CREATE POLICY "members delete salon state" ON public.salon_state
  FOR DELETE TO authenticated
  USING (salon_id IN (SELECT public.user_salon_ids(auth.uid())));

CREATE OR REPLACE FUNCTION public.touch_salon_state()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.touch_salon_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_salon_state ON public.salon_state;
CREATE TRIGGER trg_touch_salon_state
BEFORE INSERT OR UPDATE ON public.salon_state
FOR EACH ROW EXECUTE FUNCTION public.touch_salon_state();

-- 8) salon_invites
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

DROP POLICY IF EXISTS "owner reads salon invites" ON public.salon_invites;
CREATE POLICY "owner reads salon invites"
ON public.salon_invites FOR SELECT TO authenticated
USING (public.is_salon_owner(auth.uid(), salon_id));

DROP POLICY IF EXISTS "owner creates salon invites" ON public.salon_invites;
CREATE POLICY "owner creates salon invites"
ON public.salon_invites FOR INSERT TO authenticated
WITH CHECK (public.is_salon_owner(auth.uid(), salon_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "owner deletes salon invites" ON public.salon_invites;
CREATE POLICY "owner deletes salon invites"
ON public.salon_invites FOR DELETE TO authenticated
USING (public.is_salon_owner(auth.uid(), salon_id));

-- 9) Public RPC to look up invite info from join page
CREATE OR REPLACE FUNCTION public.get_invite_info(_token text)
RETURNS TABLE(salon_id uuid, salon_name text, role public.salon_role, accepted boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, i.role, (i.accepted_at IS NOT NULL)
  FROM public.salon_invites i
  JOIN public.salons s ON s.id = i.salon_id
  WHERE i.token = _token
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_invite_info(text) TO anon, authenticated;

-- 10) Auto-provision salon on new auth.users insert (consumes invite by token or email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  invite_row public.salon_invites%ROWTYPE;
  new_salon_id uuid;
  invite_token text;
BEGIN
  invite_token := NEW.raw_user_meta_data->>'invite_token';

  IF invite_token IS NOT NULL AND length(invite_token) > 0 THEN
    SELECT * INTO invite_row
    FROM public.salon_invites
    WHERE token = invite_token AND accepted_at IS NULL
    LIMIT 1;
  END IF;

  IF invite_row.id IS NULL THEN
    SELECT * INTO invite_row
    FROM public.salon_invites
    WHERE email IS NOT NULL
      AND lower(email) = lower(NEW.email)
      AND accepted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF invite_row.id IS NOT NULL THEN
    INSERT INTO public.salon_members (salon_id, user_id, role)
    VALUES (invite_row.salon_id, NEW.id, invite_row.role)
    ON CONFLICT DO NOTHING;

    UPDATE public.salon_invites
    SET accepted_at = now()
    WHERE id = invite_row.id;
  ELSE
    INSERT INTO public.salons (owner_id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'salon_name', 'صالوني'))
    RETURNING id INTO new_salon_id;

    INSERT INTO public.salon_members (salon_id, user_id, role)
    VALUES (new_salon_id, NEW.id, 'owner');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11) Extend existing tables with salon_id (nullable for now; Stage 3 will backfill + NOT NULL)
ALTER TABLE public.branches   ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE;
ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS salon_id UUID REFERENCES public.salons(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS branches_salon_id_idx   ON public.branches(salon_id);
CREATE INDEX IF NOT EXISTS operations_salon_id_idx ON public.operations(salon_id);

-- 12) Realtime
ALTER TABLE public.salon_state   REPLICA IDENTITY FULL;
ALTER TABLE public.salons        REPLICA IDENTITY FULL;
ALTER TABLE public.salon_members REPLICA IDENTITY FULL;
ALTER TABLE public.salon_invites REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salons;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_members;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_invites;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_state;
EXCEPTION WHEN duplicate_object THEN null; END $$;
