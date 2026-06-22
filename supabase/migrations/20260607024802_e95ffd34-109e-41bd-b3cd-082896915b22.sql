
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'صالون أبو يوسف – الفرع الرئيسي';

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

CREATE POLICY "Anyone can read branches" ON public.branches FOR SELECT USING (true);
CREATE POLICY "Anyone can insert branches" ON public.branches FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update branches" ON public.branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete branches" ON public.branches FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.branches;
ALTER TABLE public.branches REPLICA IDENTITY FULL;

INSERT INTO public.branches (name, location, notes)
VALUES ('صالون أبو يوسف – الفرع الرئيسي', 'الفرع الأساسي', 'الفرع الرئيسي')
ON CONFLICT (name) DO NOTHING;
