"use client";

import { getSupabaseBrowser } from "./supabase-browser";
import type { Conversation, Message } from "./types";

export interface DBChatConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DBChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  model: string | null;
  reasoning: string | null;
  tool_calls: unknown;
  tool_call_id: string | null;
  attachments: unknown;
  created_at: string;
}

// Runtime guards for fields persisted as JSON. Postgres can return any shape
// here, so we refuse to forward values that don't even pass a structural
// check rather than letting a bad row crash the UI.
function isValidToolCalls(value: unknown): value is Message["tool_calls"] {
  return Array.isArray(value);
}

function isValidAttachments(value: unknown): value is Message["attachments"] {
  return Array.isArray(value);
}

export async function getConversationsFromDB(): Promise<Conversation[]> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // SINGLE round-trip with nested join (eliminates N+1)
  const { data: convs, error } = await supabase
    .from("chat_conversations")
    .select(
      `
      id,
      title,
      created_at,
      updated_at,
      chat_messages (
        id,
        role,
        content,
        model,
        reasoning,
        tool_calls,
        tool_call_id,
        attachments,
        created_at
      )
    `,
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error || !convs) {
    console.error("[CHAT-DB] Load conversations failed:", error);
    return [];
  }

  return (convs as Array<DBChatConversation & { chat_messages: DBChatMessage[] | null }>).map(
    (conv) => {
      const messages = (conv.chat_messages ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
        .map((m): Message => {
          const toolCalls = isValidToolCalls(m.tool_calls) ? m.tool_calls : undefined;
          const attachments = isValidAttachments(m.attachments) ? m.attachments : undefined;
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            ...(m.model ? { model: m.model } : {}),
            ...(m.reasoning ? { reasoning: m.reasoning } : {}),
            ...(toolCalls ? { tool_calls: toolCalls } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(attachments ? { attachments } : {}),
          };
        });

      return {
        id: conv.id,
        title: conv.title,
        messages,
        createdAt: new Date(conv.created_at).getTime(),
        updatedAt: new Date(conv.updated_at).getTime(),
      };
    },
  );
}

export async function saveConversationToDB(conv: Conversation): Promise<void> {
  const supabase = getSupabaseBrowser();
  const supabaseUserResult = await supabase.auth.getUser();
  const userId = supabaseUserResult.data.user?.id;
  if (!userId) {
    console.warn("[CHAT-DB] No authed user, skip save");
    return;
  }

  try {
    // Upsert conversation row first so the FK target always exists for the
    // message rows below.
    const { error: convError } = await supabase
      .from("chat_conversations")
      .upsert(
        {
          id: conv.id,
          user_id: userId,
          title: conv.title || "New chat",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (convError) {
      console.error("[CHAT-DB] Save conv failed:", convError);
      return;
    }

    // Race-condition fix: previously we did delete-then-insert which loses
    // data when two saves run concurrently (a parallel save can read the
    // table between the delete and the insert). Instead, fetch the current
    // ID set, upsert the incoming messages, then delete only the rows that
    // are no longer present. This keeps the table converging on the
    // intended state without a destructive intermediate window.
    const { data: existingRows } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conv.id);
    const existingIds = (existingRows ?? []).map((r: { id: string }) => r.id);
    const incomingIds = new Set(conv.messages.map((m) => m.id));
    const toDelete = existingIds.filter((id) => !incomingIds.has(id));

    if (conv.messages.length > 0) {
      const rows = conv.messages.map((m) => ({
        id: m.id,
        conversation_id: conv.id,
        role: m.role,
        content: m.content,
        model: m.model ?? null,
        reasoning: m.reasoning ?? null,
        tool_calls: m.tool_calls ?? null,
        tool_call_id: m.tool_call_id ?? null,
        attachments: m.attachments ?? null,
        created_at: new Date(m.timestamp).toISOString(),
      }));
      const { error: msgError } = await supabase
        .from("chat_messages")
        .upsert(rows, { onConflict: "id" });
      if (msgError) {
        console.error("[CHAT-DB] Save messages failed:", msgError);
      }
    }

    if (toDelete.length > 0) {
      const { error: delError } = await supabase
        .from("chat_messages")
        .delete()
        .eq("conversation_id", conv.id)
        .in("id", toDelete);
      if (delError) {
        console.error("[CHAT-DB] Prune orphaned messages failed:", delError);
      }
    }
  } catch (e) {
    console.error("[CHAT-DB] saveConversationToDB exception:", e);
  }
}

export async function deleteConversationFromDB(id: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  // Authorization: scope the delete by user_id so a leaked or guessed
  // conversation id from another account is a no-op rather than a
  // cross-tenant delete.
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (!userId) {
    console.warn("[CHAT-DB] No authed user, skip delete");
    return;
  }

  const { error } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) console.error("[CHAT-DB] Delete failed:", error);
}

export async function clearAllConversationsFromDB(): Promise<void> {
  const supabase = getSupabaseBrowser();
  const userResult = await supabase.auth.getUser();
  const userId = userResult.data.user?.id;
  if (!userId) return;

  const { error } = await supabase.from("chat_conversations").delete().eq("user_id", userId);
  if (error) console.error("[CHAT-DB] Clear all failed:", error);
}
