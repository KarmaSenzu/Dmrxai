"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { useChat } from "@/hooks/useChat";
import Sidebar, { AppMode } from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import SettingsModal from "@/components/SettingsModal";
import ModelCatalog from "@/components/ModelCatalog";
import LoginPage from "@/components/LoginPage";

export default function Home() {
  const { theme, toggleTheme, mounted } = useTheme();
  const { settings, updateSettings, resetSettings, completeOnboarding, isConfigured, isLoaded, serverConfig } = useSettings();
  const {
    conversations,
    activeConversation,
    activeConversationId,
    isLoading,
    error,
    loadConversations,
    createConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
    stopGeneration,
    clearAllConversations,
    setError,
  } = useChat(settings, { serverManaged: serverConfig.aiConfigured });

  const [showSettings, setShowSettings] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [mode, setMode] = useState<AppMode>("chat");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  // Load conversations on mount
  useEffect(() => {
    if (isLoaded) {
      loadConversations();
    }
  }, [isLoaded, loadConversations]);

  // Fetch available models via the local edge proxy. We POST apiKey+baseUrl
  // in the JSON body so the request stays same-origin in the browser and
  // CORS isn't a concern for arbitrary providers.
  //
  // In server-managed mode the server overrides body values with env, so we
  // can fire the request even when local apiKey/baseUrl are empty — we just
  // pass through whatever we have (or placeholders) and the server resolves.
  useEffect(() => {
    if (!isConfigured) return;
    const haveLocalCreds = Boolean(settings.baseUrl && settings.apiKey);
    if (!serverConfig.aiConfigured && !haveLocalCreds) return;

    const controller = new AbortController();

    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: settings.apiKey || "_server_managed_",
        baseUrl: settings.baseUrl || serverConfig.aiBaseUrlHint || "_server_managed_",
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || `Failed to fetch models (${res.status})`);
        }
        return json;
      })
      .then((data) => {
        let models: string[] = [];
        if (data?.data && Array.isArray(data.data)) {
          models = data.data
            .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name || ""))
            .filter((id: string) => id && id.length > 0);
        } else if (Array.isArray(data)) {
          models = data
            .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name || ""))
            .filter((id: string) => id && id.length > 0);
        }
        setFetchedModels(models);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        // Don't surface this as a hard error — fall back to empty list so
        // the hardcoded catalog still works. Log for debugging.
        setFetchedModels([]);
        console.warn("Model fetch failed:", err);
      });

    return () => controller.abort();
  }, [isConfigured, settings.baseUrl, settings.apiKey, serverConfig.aiConfigured, serverConfig.aiBaseUrlHint]);

  // Prevent flash of unstyled content
  if (!mounted || !isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-light-accent dark:border-dark-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-light-muted dark:text-dark-muted">Loading...</span>
        </div>
      </div>
    );
  }

  // Show Login Page if not configured (no API Key)
  if (!isConfigured) {
    return (
      <LoginPage
        onStart={completeOnboarding}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-light-bg dark:bg-dark-bg">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewChat={createConversation}
        onSelectConversation={selectConversation}
        onDeleteConversation={deleteConversation}
        onClearAll={clearAllConversations}
        onOpenSettings={() => setShowSettings(true)}
        onOpenModels={() => setShowModels(true)}
        onLogout={() => resetSettings()}
        theme={theme}
        onToggleTheme={toggleTheme}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {mode === "chat" ? (
          <>
            {/* Chat Window */}
            <ChatWindow
              conversation={activeConversation}
              isLoading={isLoading}
              error={error}
              isConfigured={isConfigured}
              onOpenSettings={() => setShowSettings(true)}
              onDismissError={() => setError(null)}
              currentModel={settings.model}
            />

            {/* Chat Input */}
            <ChatInput
              onSend={sendMessage}
              onStop={stopGeneration}
              isLoading={isLoading}
              disabled={!isConfigured}
              currentModel={settings.model}
              onModelChange={(model) => updateSettings({ model })}
              fetchedModels={fetchedModels}
            />
          </>
        ) : (
          /* Image Generator - Locked */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-light-border dark:border-dark-border flex items-center justify-center relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-light-text dark:text-dark-text mb-3">
                Image Generator
              </h2>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Fitur Terkunci
              </div>
              <p className="text-light-muted dark:text-dark-muted mb-4 text-sm leading-relaxed">
                Fitur Image Generator membutuhkan model dari tier <strong className="text-purple-500">Wavespeed</strong> yang tidak tersedia untuk akun CodeBudy/Kiro Anda saat ini.
              </p>
              <div className="bg-light-sidebar dark:bg-dark-sidebar border border-light-border dark:border-dark-border rounded-xl p-4 text-left mb-6">
                <p className="text-xs font-semibold text-light-text dark:text-dark-text mb-2">Model yang dibutuhkan:</p>
                <div className="space-y-1.5 text-[11px] text-light-muted dark:text-dark-muted">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><span className="text-[7px] font-bold text-white">WS</span></span>
                    ws-gpt-image-2, ws-dall-e-3, ws-midjourney
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><span className="text-[7px] font-bold text-white">WS</span></span>
                    ws-flux-2-pro, ws-imagen4, ws-sora-2, dll.
                  </div>
                </div>
              </div>
              <p className="text-xs text-light-muted dark:text-dark-muted">
                Upgrade ke paket <strong className="text-purple-500">Wavespeed</strong> untuk mengakses 86 model termasuk image &amp; video generation.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={updateSettings}
        onReset={resetSettings}
      />

      {/* Model Catalog */}
      <ModelCatalog
        isOpen={showModels}
        onClose={() => setShowModels(false)}
        currentModel={settings.model}
        onModelChange={(model) => {
          updateSettings({ model });
          setShowModels(false);
        }}
        fetchedModels={fetchedModels}
      />
    </div>
  );
}
