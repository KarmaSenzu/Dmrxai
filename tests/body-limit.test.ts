import { describe, it, expect } from "vitest";
import {
  readJsonWithLimit,
  DEFAULT_MAX_BODY,
  LARGE_MAX_BODY,
} from "@/lib/body-limit";
import type { NextRequest } from "next/server";

function makeReq(body: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return {
    headers: h,
    text: async () => body,
  } as unknown as NextRequest;
}

async function readResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  return JSON.parse(text);
}

describe("body-limit", () => {
  describe("readJsonWithLimit", () => {
    it("parses valid JSON under the limit", async () => {
      const body = JSON.stringify({ hello: "world", n: 42 });
      const req = makeReq(body);
      const result = await readJsonWithLimit<{ hello: string; n: number }>(req);
      expect(result).toEqual({ hello: "world", n: 42 });
    });

    it("rejects when Content-Length exceeds the limit (fast path)", async () => {
      const req = makeReq("{}", { "content-length": String(DEFAULT_MAX_BODY + 1) });
      try {
        await readJsonWithLimit(req);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        const res = err as Response;
        expect(res.status).toBe(413);
        const json = (await readResponseJson(res)) as { error: string };
        expect(json.error).toMatch(/too large/i);
      }
    });

    it("rejects when actual body byte length exceeds limit (no Content-Length)", async () => {
      const big = "x".repeat(2048);
      const body = JSON.stringify({ payload: big });
      const req = makeReq(body); // no content-length header
      try {
        await readJsonWithLimit(req, 1024); // 1 KB limit
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).status).toBe(413);
      }
    });

    it("rejects when body contains multi-byte chars exceeding byte limit", async () => {
      // Each emoji is 4 bytes in UTF-8
      const body = JSON.stringify({ s: "😀".repeat(300) });
      const req = makeReq(body);
      try {
        await readJsonWithLimit(req, 500);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).status).toBe(413);
      }
    });

    it("rejects invalid JSON with 400", async () => {
      const req = makeReq("{not valid json");
      try {
        await readJsonWithLimit(req);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        const res = err as Response;
        expect(res.status).toBe(400);
        const json = (await readResponseJson(res)) as { error: string };
        expect(json.error).toMatch(/invalid json/i);
      }
    });

    it("rejects empty body with 400", async () => {
      const req = makeReq("");
      try {
        await readJsonWithLimit(req);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).status).toBe(400);
      }
    });

    it("respects a custom max size limit", async () => {
      const body = JSON.stringify({ data: "x".repeat(50) });
      const req = makeReq(body);
      // Limit much smaller than body
      try {
        await readJsonWithLimit(req, 10);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).status).toBe(413);
      }
    });

    it("ignores non-numeric Content-Length and falls back to byte length", async () => {
      const body = JSON.stringify({ ok: true });
      const req = makeReq(body, { "content-length": "not-a-number" });
      const result = await readJsonWithLimit<{ ok: boolean }>(req);
      expect(result).toEqual({ ok: true });
    });

    it("accepts payloads up to LARGE_MAX_BODY when configured", async () => {
      // ~1MB payload, well under the 10MB large limit
      const body = JSON.stringify({ data: "a".repeat(1024 * 1024) });
      const req = makeReq(body);
      const result = await readJsonWithLimit<{ data: string }>(req, LARGE_MAX_BODY);
      expect(result.data.length).toBe(1024 * 1024);
    });

    it("returns typed JSON for arrays and primitives", async () => {
      const req = makeReq(JSON.stringify([1, 2, 3]));
      const result = await readJsonWithLimit<number[]>(req);
      expect(result).toEqual([1, 2, 3]);
    });

    it("rejects via Content-Length even when a small body is sent (defensive)", async () => {
      const req = makeReq(JSON.stringify({ a: 1 }), {
        "content-length": String(DEFAULT_MAX_BODY * 2),
      });
      try {
        await readJsonWithLimit(req);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).status).toBe(413);
      }
    });
  });
});
