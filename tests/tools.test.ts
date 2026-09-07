import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  TOOL_DEFINITIONS,
  executeTool,
  toolDisplayLabel,
  toolIconName,
} from "@/lib/tools";

describe("tools", () => {
  describe("TOOL_DEFINITIONS", () => {
    it("exports the three tool definitions", () => {
      const names = TOOL_DEFINITIONS.map((t) => t.function.name);
      expect(names).toEqual(["web_search", "fetch_url", "render_chart"]);
    });

    it("each tool has function type and required schema fields", () => {
      for (const t of TOOL_DEFINITIONS) {
        expect(t.type).toBe("function");
        expect(typeof t.function.name).toBe("string");
        expect(typeof t.function.description).toBe("string");
        expect(t.function.parameters.type).toBe("object");
      }
    });
  });

  describe("toolDisplayLabel", () => {
    it("returns Indonesian labels for known tools", () => {
      expect(toolDisplayLabel("web_search")).toBe("Mencari di web");
      expect(toolDisplayLabel("fetch_url")).toBe("Membaca URL");
      expect(toolDisplayLabel("render_chart")).toBe("Membuat grafik");
    });

    it("returns the tool name as-is for unknown tools", () => {
      expect(toolDisplayLabel("custom_tool")).toBe("custom_tool");
    });
  });

  describe("toolIconName", () => {
    it("returns matching lucide icon names", () => {
      expect(toolIconName("web_search")).toBe("Search");
      expect(toolIconName("fetch_url")).toBe("Link2");
      expect(toolIconName("render_chart")).toBe("BarChart3");
    });

    it("returns Wrench fallback for unknown tools", () => {
      expect(toolIconName("custom")).toBe("Wrench");
    });
  });

  describe("executeTool — JSON parsing", () => {
    it("returns error JSON when arguments are not valid JSON", async () => {
      const out = await executeTool("web_search", "not-json");
      const parsed = JSON.parse(out);
      expect(parsed.error).toMatch(/Invalid JSON arguments/);
    });

    it("returns error for unknown tool name", async () => {
      const out = await executeTool("does_not_exist", "{}");
      const parsed = JSON.parse(out);
      expect(parsed.error).toBe("Unknown tool: does_not_exist");
    });
  });

  describe("executeTool — render_chart", () => {
    it("returns ok + spec for a valid bar chart", async () => {
      const args = {
        type: "bar",
        data: [{ x: "A", y: 1 }],
      };
      const out = await executeTool("render_chart", JSON.stringify(args));
      const parsed = JSON.parse(out);
      expect(parsed.ok).toBe(true);
      expect(parsed.spec).toEqual(args);
      expect(parsed.instruction).toContain("```chart");
    });

    it("returns ok for line, area, and pie chart types", async () => {
      for (const type of ["line", "area", "pie"]) {
        const out = await executeTool(
          "render_chart",
          JSON.stringify({ type, data: [{ x: 1 }] }),
        );
        const parsed = JSON.parse(out);
        expect(parsed.ok).toBe(true);
      }
    });

    it("rejects unsupported chart type", async () => {
      const out = await executeTool(
        "render_chart",
        JSON.stringify({ type: "scatter", data: [{ a: 1 }] }),
      );
      const parsed = JSON.parse(out);
      expect(parsed.error).toMatch(/Unsupported chart type/);
    });

    it("rejects empty data array", async () => {
      const out = await executeTool(
        "render_chart",
        JSON.stringify({ type: "bar", data: [] }),
      );
      const parsed = JSON.parse(out);
      expect(parsed.error).toBe("Chart data is empty");
    });

    it("rejects non-array data", async () => {
      const out = await executeTool(
        "render_chart",
        JSON.stringify({ type: "bar", data: "not-array" }),
      );
      const parsed = JSON.parse(out);
      expect(parsed.error).toBe("Chart data is empty");
    });
  });

  describe("executeTool — web_search", () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      fetchSpy.mockReset();
      globalThis.fetch = fetchSpy;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns error when query missing", async () => {
      const out = await executeTool("web_search", JSON.stringify({}));
      const parsed = JSON.parse(out);
      expect(parsed.error).toMatch(/Missing required 'query'/);
    });

    it("calls /api/search with body and returns parsed results", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          query: "next.js",
          count: 3,
          results: [{ title: "t", url: "u", snippet: "s" }],
        }),
      });

      const out = await executeTool(
        "web_search",
        JSON.stringify({ query: "next.js", count: 3 }),
      );
      const parsed = JSON.parse(out);

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/search",
        expect.objectContaining({
          method: "POST",
        }),
      );
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(callBody).toEqual({ query: "next.js", count: 3 });
      expect(parsed.results).toHaveLength(1);
    });

    it("uses default count 8 when omitted", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ query: "q", count: 8, results: [] }),
      });

      await executeTool("web_search", JSON.stringify({ query: "q" }));

      const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(callBody.count).toBe(8);
    });

    it("returns error JSON on non-ok response", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      });

      const out = await executeTool(
        "web_search",
        JSON.stringify({ query: "q" }),
      );
      const parsed = JSON.parse(out);
      expect(parsed.error).toMatch(/Search failed \(HTTP 500\)/);
      expect(parsed.results).toEqual([]);
    });
  });

  describe("executeTool — fetch_url", () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      fetchSpy.mockReset();
      globalThis.fetch = fetchSpy;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns error when url missing", async () => {
      const out = await executeTool("fetch_url", JSON.stringify({}));
      const parsed = JSON.parse(out);
      expect(parsed.error).toMatch(/Missing required 'url'/);
    });

    it("calls /api/fetch-url and returns content", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          url: "https://x.com",
          title: "X",
          text: "hello",
          truncated: false,
        }),
      });

      const out = await executeTool(
        "fetch_url",
        JSON.stringify({ url: "https://x.com" }),
      );
      const parsed = JSON.parse(out);

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/fetch-url",
        expect.objectContaining({ method: "POST" }),
      );
      expect(parsed.title).toBe("X");
      expect(parsed.text).toBe("hello");
    });

    it("returns error JSON on non-ok response", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      });

      const out = await executeTool(
        "fetch_url",
        JSON.stringify({ url: "https://x.com" }),
      );
      const parsed = JSON.parse(out);
      expect(parsed.error).toMatch(/Fetch failed \(HTTP 404\)/);
    });
  });
});
