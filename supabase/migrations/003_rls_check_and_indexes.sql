-- ============================================================
-- Migration 003: RLS WITH CHECK hardening + access-pattern indexes
-- ============================================================
-- Purpose:
--   1. The child-table policies created in 002 (project_files_self,
--      project_msgs_self) only defined a USING clause. For FOR ALL policies,
--      USING gates reads/updates/deletes but PostgreSQL falls back to the
--      USING expression for INSERT/UPDATE row checks only when no WITH CHECK
--      is given. Defining an explicit WITH CHECK makes write-time ownership
--      enforcement explicit and self-documenting, so inserting/updating a row
--      that points at a project the caller does not own is rejected outright.
--   2. Add composite indexes that match the actual query shapes issued by
--      supabase-projects.ts, so the planner can satisfy ORDER BY from the
--      index instead of sorting at runtime.
--
-- This migration is IDEMPOTENT and NON-DESTRUCTIVE:
--   - No DROP TABLE, no DROP COLUMN, no DELETE of any data.
--   - Policies are recreated via DROP POLICY IF EXISTS + CREATE POLICY with
--     the SAME ownership predicate already in use, only adding WITH CHECK.
--   - Indexes use CREATE INDEX IF NOT EXISTS and do NOT drop the existing
--     single-column indexes from 001 (idx_project_files_project_id,
--     idx_project_messages_project_id, idx_projects_user_id,
--     idx_projects_updated_at remain in place).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Re-create child-table policies with explicit USING + WITH CHECK
-- ------------------------------------------------------------

-- project_files: a row is visible/writable only when its parent project is
-- owned by the current user. WITH CHECK mirrors USING so INSERT/UPDATE that
-- reference a non-owned project_id are rejected explicitly.
DROP POLICY IF EXISTS project_files_self ON project_files;
CREATE POLICY project_files_self ON project_files
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

-- project_messages: same ownership rule, enforced for both read and write.
DROP POLICY IF EXISTS project_msgs_self ON project_messages;
CREATE POLICY project_msgs_self ON project_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- 2. Composite indexes matching real access patterns
-- ------------------------------------------------------------

-- getProjectMessages(): WHERE project_id = $1 ORDER BY created_at ASC.
-- A composite on (project_id, created_at) lets the planner filter and return
-- rows already ordered, avoiding a separate sort step.
CREATE INDEX IF NOT EXISTS idx_project_messages_project_created
  ON project_messages(project_id, created_at);

-- getUserProjects(): WHERE user_id = $1 ORDER BY updated_at DESC.
-- A composite on (user_id, updated_at DESC) serves both the filter and the
-- descending sort directly from the index.
CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON projects(user_id, updated_at DESC);
