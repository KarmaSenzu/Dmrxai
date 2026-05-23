"use client";

import { Conversation } from "@/lib/types";
import { Plus, MessageSquare, Trash2, Settings, Sun, Moon, X, Menu, Eraser, Image as ImageIcon, Cpu, Lock, LogOut, Sparkles } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export type AppMode = "chat" | "image";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onOpenModels: () => void;
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onClearAll,
  onOpenSettings,
  onOpenModels,
  onLogout,
  theme,
  onToggleTheme,
  mode,
  onModeChange,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirm === id) {
      onDeleteConversation(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-light-text dark:text-dark-text">🤖 dmrxai</h1>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex gap-1 p-1 rounded-lg bg-light-input dark:bg-dark-input mb-3">
          <button
            onClick={() => {
              onModeChange("chat");
              setIsOpen(false);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              mode === "chat"
                ? "bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text shadow-sm"
                : "text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
            }`}
          >
            <MessageSquare size={14} />
            <span>Chat</span>
          </button>
          <button
            onClick={() => {
              onModeChange("image");
              setIsOpen(false);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              mode === "image"
                ? "bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text shadow-sm"
                : "text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
            }`}
          >
            <ImageIcon size={14} />
            <span>Image</span>
            <Lock size={10} className="text-red-400" />
          </button>
        </div>

        {/* Available Models button */}
        <button
          onClick={() => {
            onOpenModels();
            setIsOpen(false);
          }}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors mb-2"
        >
          <Cpu size={14} className="text-light-accent dark:text-dark-accent" />
          <span className="text-xs font-medium">Available Models</span>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-light-accent/10 dark:bg-dark-accent/10 text-light-accent dark:text-dark-accent font-semibold">129</span>
        </button>

        {/* New Chat button - only in chat mode */}
        {mode === "chat" && (
          <button
            onClick={() => {
              onNewChat();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-light-border dark:border-dark-border hover:bg-light-hover dark:hover:bg-dark-hover text-light-text dark:text-dark-text transition-colors"
          >
            <Plus size={18} />
            <span>New Chat</span>
          </button>
        )}
      </div>

      {/* Conversation List - only in chat mode */}
      {mode === "chat" ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-light-muted dark:text-dark-muted text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    setIsOpen(false);
                  }}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    activeConversationId === conv.id
                      ? "bg-light-hover dark:bg-dark-hover text-light-text dark:text-dark-text"
                      : "text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-light-text dark:hover:text-dark-text"
                  }`}
                >
                  <MessageSquare size={16} className="flex-shrink-0" />
                  <span className="flex-1 truncate text-sm">{conv.title}</span>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className={`flex-shrink-0 p-1 rounded transition-colors ${
                      deleteConfirm === conv.id
                        ? "text-red-500 hover:text-red-400"
                        : "opacity-0 group-hover:opacity-100 text-light-muted dark:text-dark-muted hover:text-red-500"
                    }`}
                    title={deleteConfirm === conv.id ? "Click again to confirm" : "Delete conversation"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
              <ImageIcon size={24} className="text-purple-400" />
            </div>
            <p className="text-sm text-light-muted dark:text-dark-muted">
              Generate images using AI models. Configure your prompt and settings in the main panel.
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-light-border dark:border-dark-border space-y-2">
        {mode === "chat" && conversations.length > 0 && (
          <button
            onClick={onClearAll}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-red-500 transition-colors"
          >
            <Eraser size={16} />
            <span>Clear all chats</span>
          </button>
        )}
        <Link
          href="/features"
          onClick={() => setIsOpen(false)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          <Sparkles size={16} />
          <span>Features</span>
        </Link>
        <Link
          href="/models"
          onClick={() => setIsOpen(false)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          <Cpu size={16} />
          <span>Models</span>
        </Link>
        <button
          onClick={() => {
            onOpenSettings();
            setIsOpen(false);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover hover:text-light-text dark:hover:text-dark-text transition-colors"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500/70 hover:bg-red-500/10 hover:text-red-500 transition-colors"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-lg bg-light-sidebar dark:bg-dark-sidebar border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar - mobile */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-light-sidebar dark:bg-dark-sidebar transform transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </div>

      {/* Sidebar - desktop */}
      <div className="hidden lg:block w-72 flex-shrink-0 bg-light-sidebar dark:bg-dark-sidebar border-r border-light-border dark:border-dark-border h-screen">
        {sidebarContent}
      </div>
    </>
  );
}
