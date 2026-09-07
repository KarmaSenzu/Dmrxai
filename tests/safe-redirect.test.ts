import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  describe("valid relative paths", () => {
    it("accepts simple relative path /chat", () => {
      expect(safeRedirectPath("/chat")).toBe("/chat");
    });

    it("accepts /dashboard", () => {
      expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    });

    it("accepts path with query string /profile?id=1", () => {
      expect(safeRedirectPath("/profile?id=1")).toBe("/profile?id=1");
    });

    it("accepts deeply nested paths", () => {
      expect(safeRedirectPath("/a/b/c/d/e")).toBe("/a/b/c/d/e");
    });

    it("accepts root /", () => {
      expect(safeRedirectPath("/")).toBe("/");
    });

    it("accepts path with hash fragment", () => {
      expect(safeRedirectPath("/page#section")).toBe("/page#section");
    });
  });

  describe("blocks unsafe inputs", () => {
    it("blocks protocol-relative URL //evil.com", () => {
      expect(safeRedirectPath("//evil.com")).toBe("/");
    });

    it("blocks absolute URL https://evil.com", () => {
      expect(safeRedirectPath("https://evil.com")).toBe("/");
    });

    it("blocks absolute URL http://evil.com", () => {
      expect(safeRedirectPath("http://evil.com")).toBe("/");
    });

    it("blocks embedded javascript: protocol", () => {
      expect(safeRedirectPath("/javascript:alert(1)")).toBe("/");
    });

    it("blocks embedded data: protocol", () => {
      expect(safeRedirectPath("/data:text/html,foo")).toBe("/");
    });

    it("blocks embedded https: after slash", () => {
      expect(safeRedirectPath("/https://evil.com")).toBe("/");
    });

    it("blocks paths not starting with /", () => {
      expect(safeRedirectPath("chat")).toBe("/");
    });

    it("blocks empty string", () => {
      expect(safeRedirectPath("")).toBe("/");
    });

    it("blocks null", () => {
      expect(safeRedirectPath(null)).toBe("/");
    });

    it("blocks undefined", () => {
      expect(safeRedirectPath(undefined)).toBe("/");
    });

    it("blocks paths with whitespace", () => {
      expect(safeRedirectPath("/foo bar")).toBe("/");
    });

    it("blocks paths with newline", () => {
      expect(safeRedirectPath("/foo\nbar")).toBe("/");
    });

    it("blocks paths with carriage return", () => {
      expect(safeRedirectPath("/foo\rbar")).toBe("/");
    });

    it("blocks paths with tab", () => {
      expect(safeRedirectPath("/foo\tbar")).toBe("/");
    });

    it("blocks multi-slash protocol injection ///evil.com", () => {
      expect(safeRedirectPath("///evil.com")).toBe("/");
    });
  });

  describe("custom fallback", () => {
    it("returns custom fallback for null", () => {
      expect(safeRedirectPath(null, "/chat")).toBe("/chat");
    });

    it("returns custom fallback for unsafe input", () => {
      expect(safeRedirectPath("//evil.com", "/dashboard")).toBe("/dashboard");
    });

    it("returns custom fallback for empty string", () => {
      expect(safeRedirectPath("", "/home")).toBe("/home");
    });

    it("returns valid input even when custom fallback set", () => {
      expect(safeRedirectPath("/profile", "/chat")).toBe("/profile");
    });
  });
});
