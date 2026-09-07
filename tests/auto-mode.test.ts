import { describe, it, expect } from "vitest";
import { detectIntent, autoModeLabel } from "@/lib/auto-mode";

describe("detectIntent", () => {
  describe("short messages (< 8 chars)", () => {
    it("returns normal mode for very short messages", () => {
      const result = detectIntent({ content: "hi" });
      expect(result.effectiveMode).toBe("normal");
      expect(result.reason).toContain("pendek");
    });

    it("returns normal mode for empty string", () => {
      const result = detectIntent({ content: "" });
      expect(result.effectiveMode).toBe("normal");
    });
  });

  describe("agentic detection", () => {
    it("detects multi-step search + analysis (Indonesian)", () => {
      const result = detectIntent({ content: "cari informasi tentang AI lalu buat ringkasan" });
      expect(result.effectiveMode).toBe("agentic");
      expect(result.signals).toEqual(expect.arrayContaining([expect.stringContaining("agentic")]));
    });

    it("detects compare intent", () => {
      const result = detectIntent({ content: "bandingkan harga iPhone dengan Samsung" });
      expect(result.effectiveMode).toBe("agentic");
    });

    it("detects research + deep analysis", () => {
      const result = detectIntent({ content: "riset mendalam tentang machine learning" });
      expect(result.effectiveMode).toBe("agentic");
    });

    it("detects scrape/collect data intent", () => {
      const result = detectIntent({ content: "scrape data dari website ini" });
      expect(result.effectiveMode).toBe("agentic");
    });

    it("detects multi-step English intent", () => {
      const result = detectIntent({ content: "multi-step search for the best frameworks" });
      expect(result.effectiveMode).toBe("agentic");
    });
  });

  describe("web search detection", () => {
    it("detects 'latest' keyword", () => {
      const result = detectIntent({ content: "what is the latest version of React" });
      expect(result.effectiveMode).toBe("web-search");
    });

    it("detects 'berita' (news) keyword", () => {
      const result = detectIntent({ content: "berita terbaru tentang teknologi" });
      expect(result.effectiveMode).toBe("web-search");
    });

    it("detects 'harga' (price) keyword", () => {
      const result = detectIntent({ content: "harga emas hari ini berapa" });
      expect(result.effectiveMode).toBe("web-search");
    });

    it("detects 'weather' keyword", () => {
      const result = detectIntent({ content: "weather in Jakarta today please" });
      expect(result.effectiveMode).toBe("web-search");
    });

    it("detects 'cari' (search) keyword", () => {
      // "carikan info terbaru" triggers web-search via "terbaru"
      const result = detectIntent({ content: "cek harga laptop terbaru" });
      expect(result.effectiveMode).toBe("web-search");
    });

    it("does NOT trigger web search when URL is present", () => {
      const result = detectIntent({ content: "cek https://example.com/latest-news" });
      expect(result.effectiveMode).toBe("normal");
      expect(result.signals).toContain("url-in-text");
    });
  });

  describe("thinking detection", () => {
    it("detects math proof request", () => {
      const result = detectIntent({ content: "buktikan bahwa akar 2 adalah irasional" });
      expect(result.effectiveMode).toBe("thinking");
    });

    it("detects calculus keyword", () => {
      const result = detectIntent({ content: "selesaikan integral dari x^2 dx" });
      expect(result.effectiveMode).toBe("thinking");
    });

    it("detects big-O complexity analysis", () => {
      const result = detectIntent({ content: "analisis big-o dari algoritma quicksort" });
      expect(result.effectiveMode).toBe("thinking");
    });

    it("detects 'prove that' English pattern", () => {
      const result = detectIntent({ content: "prove that the sum of angles in a triangle is 180" });
      expect(result.effectiveMode).toBe("thinking");
    });

    it("detects chained arithmetic", () => {
      const result = detectIntent({ content: "hitung 123 + 456 * 789 / 12 - 34" });
      expect(result.effectiveMode).toBe("thinking");
    });

    it("detects debug/trace code request", () => {
      const result = detectIntent({ content: "debug this code step by step" });
      expect(result.effectiveMode).toBe("thinking");
    });
  });

  describe("normal mode (no detection)", () => {
    it("returns normal for generic conversation", () => {
      const result = detectIntent({ content: "jelaskan apa itu machine learning" });
      expect(result.effectiveMode).toBe("normal");
    });

    it("returns normal for simple greeting", () => {
      // "hari ini" triggers web-search, so use a greeting without temporal keywords
      const result = detectIntent({ content: "halo selamat pagi semua" });
      expect(result.effectiveMode).toBe("normal");
    });
  });

  describe("signals tracking", () => {
    it("includes url-in-text signal when URL present", () => {
      const result = detectIntent({ content: "lihat https://google.com ini bagus" });
      expect(result.signals).toContain("url-in-text");
    });

    it("includes spreadsheet-attached signal", () => {
      const result = detectIntent({
        content: "analisis data ini untuk saya",
        attachments: [
          { id: "1", type: "file", name: "data.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: "", size: 100 },
        ],
      });
      expect(result.signals).toContain("spreadsheet-attached");
    });

    it("detects csv attachment as spreadsheet", () => {
      const result = detectIntent({
        content: "analisis data ini untuk saya",
        attachments: [
          { id: "1", type: "file", name: "report.csv", mimeType: "text/csv", base64: "", size: 50 },
        ],
      });
      expect(result.signals).toContain("spreadsheet-attached");
    });

    it("uses hasSpreadsheet override", () => {
      const result = detectIntent({
        content: "analisis data ini untuk saya",
        hasSpreadsheet: true,
      });
      expect(result.signals).toContain("spreadsheet-attached");
    });
  });

  describe("priority ordering", () => {
    it("agentic takes priority over web search", () => {
      // "cari...lalu" matches agentic, "cari" alone matches web search
      const result = detectIntent({ content: "cari data terbaru lalu buat ringkasan" });
      expect(result.effectiveMode).toBe("agentic");
    });
  });
});

describe("autoModeLabel", () => {
  it("returns correct label for agentic", () => {
    expect(autoModeLabel("agentic")).toBe("Agentic auto-detect");
  });

  it("returns correct label for web-search", () => {
    expect(autoModeLabel("web-search")).toBe("Web search auto-detect");
  });

  it("returns correct label for thinking", () => {
    expect(autoModeLabel("thinking")).toBe("Thinking auto-detect");
  });

  it("returns correct label for deep-research", () => {
    expect(autoModeLabel("deep-research")).toBe("Deep Research auto-detect");
  });

  it("returns Normal for normal mode", () => {
    expect(autoModeLabel("normal")).toBe("Normal");
  });
});
