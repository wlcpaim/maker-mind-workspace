DROP POLICY IF EXISTS migration_history_read ON public.migration_history;
REVOKE ALL ON public.migration_history FROM anon, authenticated;
GRANT ALL ON public.migration_history TO service_role;

CREATE OR REPLACE FUNCTION public.devstudio_installed_version()
RETURNS TABLE(version text, name text, applied_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.version, m.name, m.applied_at
  FROM public.migration_history m
  WHERE auth.uid() IS NOT NULL
  ORDER BY m.applied_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.devstudio_installed_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devstudio_installed_version() TO authenticated;