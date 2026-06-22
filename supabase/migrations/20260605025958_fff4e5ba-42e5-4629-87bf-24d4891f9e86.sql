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

CREATE POLICY "Anyone can read operations"
  ON public.operations FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert operations"
  ON public.operations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update operations"
  ON public.operations FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete operations"
  ON public.operations FOR DELETE
  USING (true);