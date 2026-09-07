export type BuildIntentConfidence = "low" | "medium" | "high" | "none";

export interface BuildIntentResult {
  isBuild: boolean;
  confidence: BuildIntentConfidence;
  /** Short human-readable reason for the detection (Indonesian friendly). */
  reason: string;
  /** Suggested cleaned prompt to send to the builder (trimmed). */
  prompt: string;
}

// HIGH confidence — strong build verb + concrete artifact noun
const HIGH_PATTERNS: RegExp[] = [
  // Indonesian
  /\b(buat(?:kan|in)?|bikin(?:kan|in)?|kembangkan|develop)\s+(aplikasi|app|website|web|landing\s*page|dashboard|tool|game|kalkulator|todo|to[-\s]?do|form|komponen|fitur|sistem|program)\b/i,
  /\b(generate|generate(?:kan)?)\s+(aplikasi|app|component|halaman|page|sistem)\b/i,
  /\b(coding|ngoding|coba\s+coding)\s+(aplikasi|website|app|program|sistem|tool|fitur)\b/i,
  /\b(saya|aku|gw|gue)\s+(mau|ingin|pingin|kepingin|mo)\s+(buat|bikin|nyoba\s+buat|bangun)\s+(aplikasi|app|website|landing|dashboard|game|tool|sistem|program|komponen)\b/i,
  // English
  /\b(make|build|create|generate|scaffold|spin\s+up|prototype)\s+(me\s+)?(an?\s+)?(app|application|website|landing\s*page|dashboard|todo|game|calculator|form|component|ui|mvp|tool|system|program)\b/i,
  /\b(i\s+(?:want|need|wanna)\s+(?:to\s+)?(?:build|make|create))\b/i,
  /\bcan\s+you\s+(?:build|make|create)\s+(?:me\s+)?(?:an?\s+)?(app|website|page|component)\b/i,
];

// MEDIUM confidence — build keyword without strong noun, OR strong noun without build verb
const MEDIUM_PATTERNS: RegExp[] = [
  /\b(react\s+(app|component)|next\s*\.?\s*js|nextjs)\b/i,
  /\b(landing\s*page|dashboard|admin\s+panel|crud)\b/i,
  /\bmvp\b/i,
  /\b(saya\s+kepikiran|kepikiran|ada\s+ide)\s+(buat|bikin|untuk\s+(buat|bikin))/i,
  /\b(want\s+to\s+make|need\s+a\s+(simple|basic)\s+(app|site|tool|page))/i,
];

// EXCLUSION patterns — kill false positives like "what is an app", "explain how to make X"
const EXCLUSION_PATTERNS: RegExp[] = [
  /^(apa|apakah|what(\s+is)?|jelaskan|explain|how\s+to|gimana\s+cara|bagaimana)\b/i,
  /\b(definisi|arti|maksud|meaning|definition)\b/i,
  /\b(tutorial|tutorialnya|cara\s+kerja|cara\s+pakai)\b/i,
];

export function detectBuildIntent(text: string): BuildIntentResult {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 6) {
    return { isBuild: false, confidence: "none", reason: "", prompt: trimmed };
  }

  // Check exclusions first — these veto a positive match.
  for (const re of EXCLUSION_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        isBuild: false,
        confidence: "none",
        reason: "Pertanyaan informatif",
        prompt: trimmed,
      };
    }
  }

  for (const re of HIGH_PATTERNS) {
    const m = re.exec(trimmed);
    if (m) {
      return {
        isBuild: true,
        confidence: "high",
        reason: `Kata kunci build kuat: "${m[0]}"`,
        prompt: trimmed,
      };
    }
  }

  for (const re of MEDIUM_PATTERNS) {
    const m = re.exec(trimmed);
    if (m) {
      return {
        isBuild: true,
        confidence: "medium",
        reason: `Sinyal build: "${m[0]}"`,
        prompt: trimmed,
      };
    }
  }

  return { isBuild: false, confidence: "none", reason: "", prompt: trimmed };
}

export function shouldNudgeToBuilder(result: BuildIntentResult): boolean {
  return result.isBuild && (result.confidence === "high" || result.confidence === "medium");
}
