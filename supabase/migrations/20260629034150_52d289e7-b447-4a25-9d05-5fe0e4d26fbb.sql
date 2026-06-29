CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('cashier','booking','manager')),
  action text NOT NULL,
  entity text,
  entity_id text,
  actor text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS activity_log_occurred_at_idx ON public.activity_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_source_idx ON public.activity_log (source, occurred_at DESC);
