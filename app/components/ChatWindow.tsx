"use client";

import { useEffect, useRef } from "react";
import { Conversation } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import { MessageSquareText, Settings, Loader2 } from "lucide-react";
import {
  formatModelDisplayName,
  categorizeModel,
  MODEL_CATEGORIES,
} from "@/lib/model-categories";

interface ChatWindowProps {
  conversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  onOpenSettings: () => void;
  onDismissError: () => void;
  // Currently selected model (from settings). Shown as a small status badge
  // so the user can see at a glance which model is being routed to.
  currentModel?: string;
}

export default function ChatWindow({
  conversation,
  isLoading,
  error,
  isConfigured,
  onOpenSettings,
  onDismissError,
  currentModel,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  // Render the active-model badge as a header element. Defined inline so
  // both the empty and populated states can reuse the same markup.
  const activeModelBadge = currentModel ? (
    <div className="flex items-center justify-end px-4 py-2 border-b border-light-border dark:border-dark-border bg-light-bg/60 dark:bg-dark-bg/60 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-light-muted dark:text-dark-muted">Model aktif:</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent border border-light-accent/20 dark:border-dark-accent/20"
          title={currentModel}
        >
          <span aria-hidden>
            {MODEL_CATEGORIES[categorizeModel(currentModel)]?.icon ?? "🤖"}
          </span>
          <span className="max-w-[260px] truncate">
            {formatModelDisplayName(currentModel)}
          </span>
        </span>
      </div>
    </div>
  ) : null;

  // Empty state - no conversation selected
  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {activeModelBadge}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-light-accent/20 to-light-accent/5 dark:from-dark-accent/20 dark:to-dark-accent/5 flex items-center justify-center">
              <MessageSquareText size={36} className="text-light-accent dark:text-dark-accent" />
            </div>
            <h2 className="text-2xl font-bold text-light-text dark:text-dark-text mb-3">
              Welcome to dmrxai
            </h2>
            <p className="text-light-muted dark:text-dark-muted mb-6 leading-relaxed">
              Start a new conversation or select one from the sidebar.
              {!isConfigured && " First, configure your API settings to get started."}
            </p>
            {!isConfigured && (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-light-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity shadow-lg shadow-light-accent/20 dark:shadow-dark-accent/20"
              >
                <Settings size={18} />
                <span>Configure API Settings</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {activeModelBadge}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-start justify-between gap-3 backdrop-blur-sm">
          <div className="flex items-start gap-2">
            <span className="text-red-500 mt-0.5">&#9888;</span>
            <div>
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          </div>
          <button
            onClick={onDismissError}
            className="flex-shrink-0 text-red-500 hover:text-red-400 transition-colors"
          >
            &#10005;
          </button>
        </div>
      )}

      {/* Messages */}
      {conversation.messages.length === 0 ? (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-light-input dark:bg-dark-input flex items-center justify-center">
              <MessageSquareText size={24} className="text-light-muted dark:text-dark-muted" />
            </div>
            <h3 className="text-lg font-semibold text-light-text dark:text-dark-text mb-2">
              Start chatting
            </h3>
            <p className="text-light-muted dark:text-dark-muted text-sm">
              Type a message below to begin the conversation.
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-2 py-4">
          {conversation.messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={
                isLoading &&
                index === conversation.messages.length - 1 &&
                message.role === "assistant"
              }
            />
          ))}

          {/* Loading indicator - shown when waiting for first response */}
          {isLoading && conversation.messages[conversation.messages.length - 1]?.role === "user" && (
            <div className="flex gap-4 px-4 py-6 fade-in">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-600 text-white">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm mb-2 text-light-text dark:text-dark-text">
                  Assistant
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-emerald-500 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-emerald-500 rounded-full typing-dot" />
                  </div>
                  <span className="text-sm text-light-muted dark:text-dark-muted animate-pulse">
                    Sedang memproses...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
}
