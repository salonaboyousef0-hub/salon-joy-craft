DROP POLICY IF EXISTS "Anyone can insert operations" ON public.operations;
DROP POLICY IF EXISTS "Anyone can update operations" ON public.operations;
DROP POLICY IF EXISTS "Anyone can delete operations" ON public.operations;

REVOKE INSERT, UPDATE, DELETE ON public.operations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.operations FROM authenticated;