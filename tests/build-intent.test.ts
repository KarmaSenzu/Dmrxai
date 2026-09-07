import { describe, it, expect } from "vitest";
import { detectBuildIntent, shouldNudgeToBuilder } from "@/lib/build-intent";

describe("detectBuildIntent", () => {
  describe("short/empty input", () => {
    it("returns none for empty string", () => {
      const result = detectBuildIntent("");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });

    it("returns none for very short input (< 6 chars)", () => {
      const result = detectBuildIntent("hi");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });

    it("handles null-ish input gracefully", () => {
      const result = detectBuildIntent(null as unknown as string);
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });
  });

  describe("high confidence detection (Indonesian)", () => {
    it("detects 'buatkan aplikasi'", () => {
      const result = detectBuildIntent("buatkan aplikasi todo list");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
      expect(result.reason).toContain("buatkan aplikasi");
    });

    it("detects 'bikin website'", () => {
      const result = detectBuildIntent("bikin website portfolio saya");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'buat landing page'", () => {
      const result = detectBuildIntent("buat landing page untuk startup saya");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'saya mau buat aplikasi'", () => {
      const result = detectBuildIntent("saya mau buat aplikasi kalkulator");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'kembangkan sistem'", () => {
      const result = detectBuildIntent("kembangkan sistem manajemen inventori");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });
  });

  describe("high confidence detection (English)", () => {
    it("detects 'build me an app'", () => {
      const result = detectBuildIntent("build me an app for tracking expenses");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'create a website'", () => {
      const result = detectBuildIntent("create a website for my business");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'I want to build'", () => {
      const result = detectBuildIntent("I want to build a dashboard");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'can you build me a'", () => {
      const result = detectBuildIntent("can you build me a component for login");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("detects 'scaffold a todo app'", () => {
      const result = detectBuildIntent("scaffold a todo app with React");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("high");
    });
  });

  describe("medium confidence detection", () => {
    it("detects 'react app' mention", () => {
      const result = detectBuildIntent("react app with authentication");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("medium");
    });

    it("detects 'landing page' without build verb", () => {
      const result = detectBuildIntent("landing page untuk produk baru");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("medium");
    });

    it("detects 'dashboard' keyword", () => {
      const result = detectBuildIntent("dashboard admin panel untuk toko online");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("medium");
    });

    it("detects 'MVP' keyword", () => {
      const result = detectBuildIntent("MVP untuk startup fintech saya");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("medium");
    });

    it("detects 'nextjs' keyword", () => {
      const result = detectBuildIntent("nextjs project with tailwind");
      expect(result.isBuild).toBe(true);
      expect(result.confidence).toBe("medium");
    });
  });

  describe("exclusion patterns (false positive prevention)", () => {
    it("excludes 'apa itu app'", () => {
      const result = detectBuildIntent("apa itu app development");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
      expect(result.reason).toContain("informatif");
    });

    it("excludes 'explain how to make'", () => {
      const result = detectBuildIntent("explain how to make a website");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });

    it("excludes 'jelaskan' (explain)", () => {
      const result = detectBuildIntent("jelaskan cara membuat aplikasi");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });

    it("excludes 'tutorial' keyword", () => {
      const result = detectBuildIntent("tutorial membuat website dengan React");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });

    it("excludes 'what is' questions", () => {
      const result = detectBuildIntent("what is an app framework");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });
  });

  describe("no match (none confidence)", () => {
    it("returns none for general conversation", () => {
      const result = detectBuildIntent("bagaimana cuaca hari ini di Jakarta");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });

    it("returns none for code questions", () => {
      const result = detectBuildIntent("kenapa kode saya error di line 42");
      expect(result.isBuild).toBe(false);
      expect(result.confidence).toBe("none");
    });
  });

  describe("prompt passthrough", () => {
    it("returns trimmed prompt in result", () => {
      const result = detectBuildIntent("  build me an app  ");
      expect(result.prompt).toBe("build me an app");
    });
  });
});

describe("shouldNudgeToBuilder", () => {
  it("returns true for high confidence build", () => {
    const result = detectBuildIntent("buatkan aplikasi todo");
    expect(shouldNudgeToBuilder(result)).toBe(true);
  });

  it("returns true for medium confidence build", () => {
    const result = detectBuildIntent("landing page untuk startup");
    expect(shouldNudgeToBuilder(result)).toBe(true);
  });

  it("returns false for none confidence", () => {
    const result = detectBuildIntent("hello world");
    expect(shouldNudgeToBuilder(result)).toBe(false);
  });

  it("returns false for excluded patterns", () => {
    const result = detectBuildIntent("apa itu website builder");
    expect(shouldNudgeToBuilder(result)).toBe(false);
  });
});
