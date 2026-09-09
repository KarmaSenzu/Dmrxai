-- ============================================================
-- Migration 004: Secure RLS + user_id type for builder tables
-- ============================================================
-- The original 001 migration created projects/project_files/project_messages
-- with `user_id TEXT` and permissive RLS (`USING (true)`), which lets ANY
-- authenticated user read/write ANY project. This migration tightens it.

-- 1. Disable RLS so we can drop policies + alter the column type without
--    hitting "cannot alter type of a column used in a policy definition".
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_messages DISABLE ROW LEVEL SECURITY;

-- 2. Drop every known policy on the builder tables (001/002/003 + any
--    out-of-band ones like projects_self). IF EXISTS keeps this idempotent.
DROP POLICY IF EXISTS "Users can CRUD own projects" ON projects;
DROP POLICY IF EXISTS "Users can CRUD own project files" ON project_files;
DROP POLICY IF EXISTS "Users can CRUD own project messages" ON project_messages;
DROP POLICY IF EXISTS projects_self ON projects;
DROP POLICY IF EXISTS project_files_self ON project_files;
DROP POLICY IF EXISTS project_msgs_self ON project_messages;

-- 3. Convert projects.user_id from TEXT to UUID.
ALTER TABLE projects
  ALTER COLUMN user_id TYPE UUID USING (user_id::UUID);

-- 4. Re-enable RLS + create owner-scoped policies.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner projects" ON projects
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner project files" ON project_files
  FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "owner project messages" ON project_messages
  FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
