-- ============================================================
-- Migration 002: Auth integration + user-scoped data
-- ============================================================

-- 1. Profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. User settings (replaces chat-app-settings + theme + image-settings)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT,
  temperature REAL DEFAULT 0.7,
  max_tokens INT DEFAULT 4096,
  system_prompt TEXT DEFAULT '',
  theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark','light')),
  image_settings JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Chat conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL DEFAULT '',
  model TEXT,
  reasoning TEXT,
  tool_calls JSONB,
  tool_call_id TEXT,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Image generations
CREATE TABLE IF NOT EXISTS image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  width INT,
  height INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Migrate existing builder tables to UUID + auth.users FK
-- Skip if already UUID type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'user_id' AND data_type = 'text'
  ) THEN
    -- Existing TEXT user_id rows are pre-auth data; clear them out (keeps schema clean)
    DELETE FROM projects WHERE user_id !~ '^[0-9a-fA-F-]{36}$';
    ALTER TABLE projects ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'projects' AND constraint_name = 'projects_user_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated
  ON chat_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_image_generations_user
  ON image_generations(user_id, created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generations   ENABLE ROW LEVEL SECURITY;

-- Drop old open policies if exist
DROP POLICY IF EXISTS "Users can CRUD own projects"          ON projects;
DROP POLICY IF EXISTS "Users can CRUD own project files"     ON project_files;
DROP POLICY IF EXISTS "Users can CRUD own project messages"  ON project_messages;

-- New scoped policies
DROP POLICY IF EXISTS profiles_self ON profiles;
CREATE POLICY profiles_self ON profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS settings_self ON user_settings;
CREATE POLICY settings_self ON user_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS conv_self ON chat_conversations;
CREATE POLICY conv_self ON chat_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS msg_self ON chat_messages;
CREATE POLICY msg_self ON chat_messages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM chat_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS images_self ON image_generations;
CREATE POLICY images_self ON image_generations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS projects_self ON projects;
CREATE POLICY projects_self ON projects
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS project_files_self ON project_files;
CREATE POLICY project_files_self ON project_files
  FOR ALL USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS project_msgs_self ON project_messages;
CREATE POLICY project_msgs_self ON project_messages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

-- ============================================================
-- Auto-create profile + settings on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
