"use client";

import { useState, useEffect } from "react";
import { Settings } from "@/lib/types";
import { X, RotateCcw, CheckCircle2 } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Partial<Settings>) => void;
  onReset: () => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSave, onReset }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-light-border dark:border-dark-border">
          <h2 className="text-xl font-bold text-light-text dark:text-dark-text">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-light-hover dark:hover:bg-dark-hover text-light-muted dark:text-dark-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Free access banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500 mt-0.5" />
            <p className="text-xs text-light-muted dark:text-dark-muted leading-relaxed">
              <strong className="text-light-text dark:text-dark-text">Akses gratis:</strong> Semua model AI tersedia tanpa biaya. Tidak perlu API key — semua tagihan di-cover oleh penyedia layanan.
            </p>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
              System Prompt
            </label>
            <textarea
              value={localSettings.systemPrompt}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder="You are a helpful assistant."
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:border-light-accent dark:focus:border-dark-accent transition-colors resize-none text-sm"
            />
            <p className="text-[10px] text-light-muted dark:text-dark-muted mt-1">
              Instruksi dasar untuk AI. Kosongkan untuk menggunakan default.
            </p>
            <p className="text-[10px] text-light-muted dark:text-dark-muted mt-1 leading-relaxed">
              💡 Default prompt sudah meminta model identifikasi diri secara jujur.
              Saat kamu ketik <code className="px-1 rounded bg-light-input dark:bg-dark-input">model apa kamu?</code> di
              chat, model akan reveal nama teknisnya (mis. <code className="px-1 rounded bg-light-input dark:bg-dark-input">claude-sonnet-4-6</code>).
              Klik <strong>Reset</strong> untuk memuat ulang prompt default ini.
            </p>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
              Temperature: {localSettings.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={localSettings.temperature}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
              className="w-full accent-light-accent dark:accent-dark-accent"
            />
            <div className="flex justify-between text-xs text-light-muted dark:text-dark-muted mt-1">
              <span>Precise (0)</span>
              <span>Creative (2)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">
              Max Tokens
            </label>
            <input
              type="number"
              value={localSettings.maxTokens}
              onChange={(e) => setLocalSettings((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) || 16384 }))}
              min={1}
              max={128000}
              className="w-full px-3 py-2.5 rounded-lg bg-light-input dark:bg-dark-input border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:border-light-accent dark:focus:border-dark-accent transition-colors"
            />
            <p className="text-[10px] text-light-muted dark:text-dark-muted mt-1">
              Jumlah maksimal token untuk respons AI. Gunakan nilai lebih tinggi (16384+) untuk analisa file/dokumen panjang. Saat mengupload file, minimum 16384 token akan otomatis digunakan.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-light-border dark:border-dark-border">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-2 text-sm text-light-muted dark:text-dark-muted hover:text-red-500 transition-colors"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-light-muted dark:text-dark-muted hover:bg-light-hover dark:hover:bg-dark-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm bg-light-accent dark:bg-dark-accent text-white hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
