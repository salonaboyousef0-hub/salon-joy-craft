
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS pin text;

UPDATE public.branches SET slug = lower(regexp_replace(encode(gen_random_bytes(4),'hex'),'[^a-z0-9]','','g')) WHERE slug IS NULL;

ALTER TABLE public.branches ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_unique ON public.branches(slug);
