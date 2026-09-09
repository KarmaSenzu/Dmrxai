-- ============================================================
-- Migration 004: Secure RLS + user_id type for builder tables
-- ============================================================
-- The original 001 migration created projects/project_files/project_messages
-- with `user_id TEXT` and permissive RLS (`USING (true)`), which lets ANY
-- authenticated user read/write ANY project. This migration tightens it.

-- 1. Drop the old permissive policies.
DROP POLICY IF EXISTS "Users can CRUD own projects" ON projects;
DROP POLICY IF EXISTS "Users can CRUD own project files" ON project_files;
DROP POLICY IF EXISTS "Users can CRUD own project messages" ON project_messages;

-- 2. Convert projects.user_id from TEXT to UUID (best-effort; rows with
--    non-UUID values would be dropped, but in practice they are auth UUIDs).
ALTER TABLE projects
  ALTER COLUMN user_id TYPE UUID USING (user_id::UUID);

-- 3. Secure policies scoped to the authenticated user.
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
