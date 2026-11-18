
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.api_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('gemini','github')),
  name text NOT NULL,
  model text,
  google_project text,
  secret_ciphertext text NOT NULL,
  secret_hint text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'untested' CHECK (status IN ('untested','ok','error','quota_exceeded','invalid')),
  last_error text,
  last_tested_at timestamptz,
  quota_exceeded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_connections_user_idx ON public.api_connections(user_id, provider);
GRANT SELECT (id, user_id, provider, name, model, google_project, secret_hint, is_primary, is_active, status, last_error, last_tested_at, quota_exceeded_at, metadata, created_at, updated_at) ON public.api_connections TO authenticated;
GRANT ALL ON public.api_connections TO service_role;
ALTER TABLE public.api_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_connections_select_own" ON public.api_connections FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER api_connections_updated BEFORE UPDATE ON public.api_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  default_model text,
  context_summary text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_idx ON public.projects(user_id, last_activity_at DESC);
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_project(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = auth.uid())
$$;

CREATE TABLE public.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.api_connections(id) ON DELETE SET NULL,
  owner text NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL,
  default_branch text NOT NULL DEFAULT 'main',
  html_url text,
  private boolean NOT NULL DEFAULT true,
  is_authorized boolean NOT NULL DEFAULT true,
  last_commit_sha text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name)
);
CREATE INDEX repositories_project_idx ON public.repositories(project_id);
CREATE TRIGGER repositories_updated BEFORE UPDATE ON public.repositories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Novo chat',
  model text NOT NULL,
  branch text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chats_user_idx ON public.chats(user_id, updated_at DESC);
CREATE INDEX chats_project_idx ON public.chats(project_id);
CREATE TRIGGER chats_updated BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_chat_idx ON public.chat_messages(chat_id, created_at);

CREATE TABLE public.project_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'context' CHECK (kind IN ('summary','decision','context','file_note','error','fix','commit')),
  title text NOT NULL,
  content text NOT NULL,
  source_chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_memory_project_idx ON public.project_memory(project_id, created_at DESC);
CREATE TRIGGER project_memory_updated BEFORE UPDATE ON public.project_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.development_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','failed','awaiting_approval','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX development_tasks_project_idx ON public.development_tasks(project_id, status);
CREATE TRIGGER development_tasks_updated BEFORE UPDATE ON public.development_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.development_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX development_logs_project_idx ON public.development_logs(project_id, created_at DESC);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  agent text NOT NULL DEFAULT 'dev-agent',
  operation text NOT NULL,
  file_path text,
  change_summary text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','rejected','needs_fix')),
  result text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  commit_sha text,
  tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_project_idx ON public.audit_logs(project_id, created_at DESC);
CREATE INDEX audit_logs_user_idx ON public.audit_logs(user_id, created_at DESC);
CREATE TRIGGER audit_logs_updated BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'manual' CHECK (reason IN ('quota','disconnect','session_end','manual','auto','error')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resumed','superseded')),
  last_operation text,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  modified_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  repo_full_name text,
  branch text,
  head_sha text,
  api_connection_id uuid REFERENCES public.api_connections(id) ON DELETE SET NULL,
  resumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkpoints_project_idx ON public.checkpoints(project_id, created_at DESC);

CREATE TABLE public.repository_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  branch text NOT NULL,
  head_sha text NOT NULL,
  tree jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX repository_snapshots_repo_idx ON public.repository_snapshots(repository_id, created_at DESC);

CREATE TABLE public.migration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  applied_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.migration_history TO authenticated;
GRANT ALL ON public.migration_history TO service_role;
ALTER TABLE public.migration_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migration_history_read" ON public.migration_history FOR SELECT TO authenticated USING (true);

CREATE TABLE public.agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id uuid NOT NULL UNIQUE REFERENCES public.chats(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','stopped','error')),
  lock_token uuid,
  api_connection_id uuid REFERENCES public.api_connections(id) ON DELETE SET NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE public.file_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  repository_id uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('create','update','delete')),
  commit_sha text,
  previous_sha text,
  new_sha text,
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_changes_project_idx ON public.file_changes(project_id, created_at DESC);

CREATE TABLE public.test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  suite text NOT NULL,
  test_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed','failed','skipped')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_results_user_idx ON public.test_results(user_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','repositories','chats','chat_messages','project_memory','development_tasks','development_logs','audit_logs','checkpoints','repository_snapshots','agent_sessions','file_changes','test_results']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t || '_select_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t || '_delete_own', t);
    IF t = 'projects' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t || '_insert_own', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || '_update_own', t);
    ELSIF t = 'chat_messages' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.user_id = auth.uid()))', t || '_insert_own', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || '_update_own', t);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.owns_project(project_id))', t || '_insert_own', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.owns_project(project_id))', t || '_update_own', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.acquire_agent_lock(_chat_id uuid, _stale_seconds integer DEFAULT 180)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chat public.chats%ROWTYPE;
  v_session public.agent_sessions%ROWTYPE;
  v_token uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_chat FROM public.chats WHERE id = _chat_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'chat not found'; END IF;
  SELECT * INTO v_session FROM public.agent_sessions WHERE chat_id = _chat_id FOR UPDATE;
  IF FOUND AND v_session.status = 'running' AND v_session.heartbeat_at > now() - make_interval(secs => _stale_seconds) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.agent_sessions (user_id, chat_id, project_id, status, lock_token, heartbeat_at, started_at, ended_at)
  VALUES (auth.uid(), _chat_id, v_chat.project_id, 'running', v_token, now(), now(), NULL)
  ON CONFLICT (chat_id) DO UPDATE SET status = 'running', lock_token = v_token, heartbeat_at = now(), started_at = now(), ended_at = NULL;
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.acquire_agent_lock(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_agent_lock(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_agent_lock(_chat_id uuid, _token uuid, _status text DEFAULT 'idle')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.agent_sessions SET status = _status, lock_token = NULL, ended_at = now()
  WHERE chat_id = _chat_id AND user_id = auth.uid() AND lock_token = _token;
$$;
REVOKE ALL ON FUNCTION public.release_agent_lock(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_agent_lock(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.devstudio_schema_status()
RETURNS TABLE(table_name text, exists_flag boolean, rls_enabled boolean, policy_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.t,
         c.oid IS NOT NULL,
         COALESCE(c.relrowsecurity, false),
         COALESCE((SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = e.t), 0)
  FROM unnest(ARRAY['profiles','api_connections','projects','repositories','chats','chat_messages','project_memory','development_tasks','development_logs','audit_logs','checkpoints','repository_snapshots','migration_history','agent_sessions','file_changes','test_results']) AS e(t)
  LEFT JOIN pg_class c ON c.relname = e.t AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
$$;
REVOKE ALL ON FUNCTION public.devstudio_schema_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devstudio_schema_status() TO authenticated;

CREATE POLICY "project_files_select_own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "project_files_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "project_files_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "project_files_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-files' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO public.migration_history (version, name, description)
VALUES ('2026.11.18-001', 'devstudio_core_v1', 'Estrutura base: 16 tabelas, RLS, índices, funções, bucket privado')
ON CONFLICT (version) DO NOTHING;
