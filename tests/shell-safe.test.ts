import { describe, it, expect } from "vitest";
import {
  shellQuote,
  validatePath,
  validateDir,
  buildCommand,
} from "@/lib/shell-safe";

describe("shell-safe", () => {
  describe("shellQuote", () => {
    it("wraps a simple string in single quotes", () => {
      expect(shellQuote("hello")).toBe("'hello'");
    });

    it("returns '' for empty string", () => {
      expect(shellQuote("")).toBe("''");
    });

    it("escapes a single embedded quote using '\\''", () => {
      // input: it's
      // expected: 'it'\''s'
      expect(shellQuote("it's")).toBe("'it'\\''s'");
    });

    it("escapes multiple embedded single quotes", () => {
      expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'");
    });

    it("preserves shell metacharacters inside single quotes", () => {
      // Inside single quotes none of these are special, so they stay literal.
      const dangerous = "; rm -rf / `whoami` $(id) && echo pwned | cat";
      const quoted = shellQuote(dangerous);
      expect(quoted).toBe(`'${dangerous}'`);
      // Sanity: no unescaped meta-character can break out.
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
    });

    it("preserves backticks literally inside single quotes", () => {
      expect(shellQuote("`whoami`")).toBe("'`whoami`'");
    });

    it("preserves dollar signs literally inside single quotes", () => {
      expect(shellQuote("$HOME")).toBe("'$HOME'");
    });

    it("handles strings containing only single quotes", () => {
      expect(shellQuote("'")).toBe("''\\'''");
    });

    it("handles paths with spaces", () => {
      expect(shellQuote("/path with spaces/file.txt")).toBe(
        "'/path with spaces/file.txt'",
      );
    });
  });

  describe("validatePath", () => {
    it("accepts a normal absolute path", () => {
      expect(validatePath("/home/user/file.ts")).toBe("/home/user/file.ts");
    });

    it("accepts a relative path", () => {
      expect(validatePath("src/index.ts")).toBe("src/index.ts");
    });

    it("accepts a path with spaces", () => {
      expect(validatePath("/my folder/file.txt")).toBe("/my folder/file.txt");
    });

    it("accepts a single dot directory", () => {
      expect(validatePath(".")).toBe(".");
    });

    it("rejects empty string", () => {
      expect(() => validatePath("")).toThrow("Path cannot be empty");
    });

    it("rejects path with null byte", () => {
      expect(() => validatePath("/etc/passwd\0.png")).toThrow(
        "Path contains null byte",
      );
    });

    it("rejects path traversal with ..", () => {
      expect(() => validatePath("../etc/passwd")).toThrow(
        "Path traversal not allowed",
      );
    });

    it("rejects nested path traversal", () => {
      expect(() => validatePath("foo/../../bar")).toThrow(
        "Path traversal not allowed",
      );
    });

    it("rejects shell metacharacter: semicolon", () => {
      expect(() => validatePath("foo;rm -rf /")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects shell metacharacter: backtick", () => {
      expect(() => validatePath("foo`whoami`")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects shell metacharacter: dollar sign", () => {
      expect(() => validatePath("$HOME/file")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects shell metacharacter: pipe", () => {
      expect(() => validatePath("foo|cat")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects shell metacharacter: ampersand", () => {
      expect(() => validatePath("foo&bar")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects shell metacharacter: redirection (<, >)", () => {
      expect(() => validatePath("foo>out")).toThrow(
        "Path contains unsafe characters",
      );
      expect(() => validatePath("foo<in")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects glob characters (*, ?)", () => {
      expect(() => validatePath("foo*")).toThrow(
        "Path contains unsafe characters",
      );
      expect(() => validatePath("foo?")).toThrow(
        "Path contains unsafe characters",
      );
    });

    it("rejects path that exceeds maximum length", () => {
      const huge = "/" + "a".repeat(4096);
      expect(() => validatePath(huge)).toThrow("Path too long");
    });

    it("rejects non-string input", () => {
      expect(() => validatePath(123 as unknown as string)).toThrow(
        "Path must be a string",
      );
      expect(() => validatePath(null as unknown as string)).toThrow(
        "Path must be a string",
      );
    });

    it("accepts alphanumeric file names with extensions", () => {
      expect(validatePath("Component_v2.test.tsx")).toBe(
        "Component_v2.test.tsx",
      );
    });
  });

  describe("validateDir", () => {
    it("accepts a normal directory path", () => {
      expect(validateDir("/home/project")).toBe("/home/project");
    });

    it("rejects directory with shell metacharacters", () => {
      expect(() => validateDir("/tmp;rm")).toThrow(
        "Path contains unsafe characters",
      );
    });
  });

  describe("buildCommand", () => {
    it("quotes all arguments safely", () => {
      expect(buildCommand("rm", ["-f", "/safe/path"])).toBe(
        "rm '-f' '/safe/path'",
      );
    });

    it("renders empty argument list", () => {
      expect(buildCommand("ls", [])).toBe("ls");
    });

    it("escapes a malicious argument", () => {
      const cmd = buildCommand("ls", ["; rm -rf /"]);
      expect(cmd).toBe("ls '; rm -rf /'");
    });

    it("escapes embedded single quotes in arguments", () => {
      expect(buildCommand("echo", ["it's"])).toBe("echo 'it'\\''s'");
    });
  });
});
