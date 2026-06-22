
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

CREATE POLICY "external_branches open read" ON public.external_branches FOR SELECT USING (true);
CREATE POLICY "external_branches open insert" ON public.external_branches FOR INSERT WITH CHECK (true);
CREATE POLICY "external_branches open update" ON public.external_branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "external_branches open delete" ON public.external_branches FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.touch_external_branches() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_external_branches
BEFORE UPDATE ON public.external_branches
FOR EACH ROW EXECUTE FUNCTION public.touch_external_branches();
