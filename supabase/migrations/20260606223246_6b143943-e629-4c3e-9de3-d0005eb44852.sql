ALTER TABLE public.operations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.operations;