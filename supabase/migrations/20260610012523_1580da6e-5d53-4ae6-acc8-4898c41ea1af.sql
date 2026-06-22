
CREATE POLICY "task-attachments select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.is_app_owner(auth.uid())
        OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
      )
  )
);

CREATE POLICY "task-attachments insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.is_app_owner(auth.uid())
        OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
      )
  )
);

CREATE POLICY "task-attachments delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.is_app_owner(auth.uid())
        OR (t.branch_id IS NOT NULL AND public.is_branch_manager(auth.uid(), t.branch_id))
      )
  )
);
