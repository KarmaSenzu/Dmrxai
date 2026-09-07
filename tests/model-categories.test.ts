import { describe, it, expect } from "vitest";
import {
  categorizeModel,
  groupModels,
  formatModelDisplayName,
  scoreModel,
  detectCapabilities,
  getActiveCapabilities,
  MODEL_CATEGORIES,
} from "@/lib/model-categories";

describe("categorizeModel", () => {
  it("returns 'other' for empty string", () => {
    expect(categorizeModel("")).toBe("other");
  });

  it("returns 'other' for unknown model", () => {
    expect(categorizeModel("some-random-model")).toBe("other");
  });

  describe("Claude family", () => {
    it("categorizes claude-opus-4-7", () => {
      expect(categorizeModel("claude-opus-4-7")).toBe("claude");
    });

    it("categorizes cc/ prefixed claude", () => {
      expect(categorizeModel("cc/claude-sonnet-4")).toBe("claude");
    });

    it("categorizes anthropic/ prefixed", () => {
      expect(categorizeModel("anthropic/claude-3-haiku")).toBe("claude");
    });

    it("categorizes by keyword 'sonnet'", () => {
      expect(categorizeModel("kr/sonnet-3.5")).toBe("claude");
    });

    it("categorizes by keyword 'opus'", () => {
      expect(categorizeModel("opus-latest")).toBe("claude");
    });
  });

  describe("GPT family", () => {
    it("categorizes gpt-4o", () => {
      expect(categorizeModel("gpt-4o")).toBe("gpt");
    });

    it("categorizes gpt-3.5-turbo", () => {
      expect(categorizeModel("gpt-3.5-turbo")).toBe("gpt");
    });

    it("categorizes chatgpt-4o-latest", () => {
      expect(categorizeModel("chatgpt-4o-latest")).toBe("gpt");
    });
  });

  describe("o1/o3 reasoning family", () => {
    it("categorizes o1-preview", () => {
      expect(categorizeModel("o1-preview")).toBe("o1");
    });

    it("categorizes o3-mini", () => {
      expect(categorizeModel("o3-mini")).toBe("o1");
    });

    it("categorizes openai/o4-mini", () => {
      expect(categorizeModel("openai/o4-mini")).toBe("o1");
    });
  });

  describe("Gemini family", () => {
    it("categorizes gemini-2.0-flash", () => {
      expect(categorizeModel("gemini-2.0-flash")).toBe("gemini");
    });

    it("categorizes gemini-1.5-pro", () => {
      expect(categorizeModel("gemini-1.5-pro")).toBe("gemini");
    });
  });

  describe("DeepSeek family", () => {
    it("categorizes deepseek-chat", () => {
      expect(categorizeModel("deepseek-chat")).toBe("deepseek");
    });

    it("categorizes ds- prefix", () => {
      expect(categorizeModel("ds-coder-v2")).toBe("deepseek");
    });
  });

  describe("Llama family", () => {
    it("categorizes llama-3.2-70b", () => {
      expect(categorizeModel("llama-3.2-70b")).toBe("llama");
    });

    it("categorizes meta- prefix", () => {
      expect(categorizeModel("meta-llama-3")).toBe("llama");
    });
  });

  describe("Qwen family", () => {
    it("categorizes qwen-2.5-72b", () => {
      expect(categorizeModel("qwen-2.5-72b")).toBe("qwen");
    });

    it("categorizes qwq model", () => {
      expect(categorizeModel("qwq-32b")).toBe("qwen");
    });
  });

  describe("Mistral family", () => {
    it("categorizes mistral-large", () => {
      expect(categorizeModel("mistral-large-latest")).toBe("mistral");
    });

    it("categorizes mixtral", () => {
      expect(categorizeModel("mixtral-8x22b")).toBe("mistral");
    });

    it("categorizes codestral", () => {
      expect(categorizeModel("codestral-latest")).toBe("mistral");
    });
  });

  describe("Grok family", () => {
    it("categorizes grok-2", () => {
      expect(categorizeModel("grok-2")).toBe("grok");
    });

    it("categorizes xai/ prefix", () => {
      expect(categorizeModel("xai/grok-3")).toBe("grok");
    });
  });

  describe("Cohere family", () => {
    it("categorizes command-r-plus", () => {
      expect(categorizeModel("command-r-plus")).toBe("cohere");
    });

    it("categorizes command-r", () => {
      expect(categorizeModel("command-r")).toBe("cohere");
    });
  });

  describe("Perplexity family", () => {
    it("categorizes sonar-pro", () => {
      expect(categorizeModel("sonar-pro")).toBe("perplexity");
    });

    it("categorizes pplx prefix", () => {
      expect(categorizeModel("pplx-7b-online")).toBe("perplexity");
    });
  });

  describe("provider prefix stripping", () => {
    it("strips prefix before matching", () => {
      expect(categorizeModel("openai/gpt-4o")).toBe("gpt");
    });

    it("handles multiple slashes by using first", () => {
      expect(categorizeModel("provider/deepseek-r1")).toBe("deepseek");
    });
  });
});

describe("formatModelDisplayName", () => {
  it("returns empty string for empty input", () => {
    expect(formatModelDisplayName("")).toBe("");
  });

  it("strips provider prefix", () => {
    expect(formatModelDisplayName("cc/claude-opus-4-7")).toBe("claude-opus-4-7");
  });

  it("returns as-is when no prefix", () => {
    expect(formatModelDisplayName("gpt-4o")).toBe("gpt-4o");
  });

  it("handles slash at end (no strip)", () => {
    // Edge case: slash at position 0 with nothing after
    expect(formatModelDisplayName("a/")).toBe("a/");
  });
});

describe("scoreModel", () => {
  it("returns 0 for empty string", () => {
    expect(scoreModel("")).toBe(0);
  });

  it("returns 50 for unknown model", () => {
    expect(scoreModel("unknown-model-xyz")).toBe(50);
  });

  it("scores claude opus higher than sonnet", () => {
    expect(scoreModel("claude-opus-4-7")).toBeGreaterThan(scoreModel("claude-sonnet-4"));
  });

  it("scores claude sonnet higher than haiku", () => {
    expect(scoreModel("claude-sonnet-4")).toBeGreaterThan(scoreModel("claude-haiku-3"));
  });

  it("scores gpt-4o higher than gpt-3.5", () => {
    expect(scoreModel("gpt-4o")).toBeGreaterThan(scoreModel("gpt-3.5-turbo"));
  });

  it("adds version bonus for decimal versions", () => {
    const score47 = scoreModel("claude-opus-4.7");
    const score46 = scoreModel("claude-opus-4.6");
    expect(score47).toBeGreaterThan(score46);
  });

  it("strips provider prefix before scoring", () => {
    expect(scoreModel("kr/claude-opus-4.7")).toBe(scoreModel("claude-opus-4.7"));
  });

  it("scores deepseek-r1 higher than deepseek-chat", () => {
    expect(scoreModel("deepseek-r1")).toBeGreaterThan(scoreModel("deepseek-chat"));
  });
});

describe("groupModels", () => {
  it("returns empty array for empty input", () => {
    expect(groupModels([])).toEqual([]);
  });

  it("groups models by category", () => {
    const models = [
      { id: "gpt-4o", displayName: "GPT-4o" },
      { id: "claude-opus-4-7", displayName: "Claude Opus" },
      { id: "gpt-3.5-turbo", displayName: "GPT-3.5" },
    ];
    const result = groupModels(models);
    const gptGroup = result.find((g) => g.category.id === "gpt");
    const claudeGroup = result.find((g) => g.category.id === "claude");
    expect(gptGroup).toBeDefined();
    expect(gptGroup!.models).toHaveLength(2);
    expect(claudeGroup).toBeDefined();
    expect(claudeGroup!.models).toHaveLength(1);
  });

  it("sorts groups by category order", () => {
    const models = [
      { id: "deepseek-chat" },
      { id: "claude-opus-4" },
      { id: "gpt-4o" },
    ];
    const result = groupModels(models);
    const orders = result.map((g) => g.category.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("sorts models within group by score descending", () => {
    const models = [
      { id: "claude-haiku-3", displayName: "Haiku" },
      { id: "claude-opus-4.7", displayName: "Opus" },
      { id: "claude-sonnet-4", displayName: "Sonnet" },
    ];
    const result = groupModels(models);
    const claudeGroup = result.find((g) => g.category.id === "claude");
    expect(claudeGroup!.models[0].id).toBe("claude-opus-4.7");
  });

  it("skips null/undefined entries", () => {
    const models = [
      null,
      { id: "gpt-4o" },
      undefined,
      { id: "" },
    ] as any[];
    const result = groupModels(models);
    const gptGroup = result.find((g) => g.category.id === "gpt");
    expect(gptGroup!.models).toHaveLength(1);
  });

  it("uses name as fallback for displayName", () => {
    const models = [{ id: "gpt-4o", name: "GPT 4o Model" }];
    const result = groupModels(models);
    const gptGroup = result.find((g) => g.category.id === "gpt");
    expect(gptGroup!.models[0].displayName).toBe("GPT 4o Model");
  });
});

describe("detectCapabilities", () => {
  it("detects vision for gpt-4o", () => {
    const caps = detectCapabilities("gpt-4o");
    expect(caps.vision).toBe(true);
  });

  it("detects reasoning for o1", () => {
    const caps = detectCapabilities("o1-preview");
    expect(caps.reasoning).toBe(true);
  });

  it("detects tools for claude-3-sonnet", () => {
    const caps = detectCapabilities("claude-3-sonnet");
    expect(caps.tools).toBe(true);
  });

  it("detects long context for gemini-1.5-pro", () => {
    const caps = detectCapabilities("gemini-1.5-pro");
    expect(caps.longContext).toBe(true);
  });

  it("detects audio for gpt-4o-audio", () => {
    const caps = detectCapabilities("gpt-4o-audio-preview");
    expect(caps.audio).toBe(true);
  });

  it("detects code for deepseek-coder", () => {
    const caps = detectCapabilities("deepseek-coder-v2");
    expect(caps.code).toBe(true);
  });

  it("detects fast for haiku models", () => {
    const caps = detectCapabilities("claude-3-haiku");
    expect(caps.fast).toBe(true);
  });

  it("detects multilingual for qwen", () => {
    const caps = detectCapabilities("qwen-2.5-72b");
    expect(caps.multilingual).toBe(true);
  });

  it("returns all false for empty string", () => {
    const caps = detectCapabilities("");
    expect(caps.vision).toBe(false);
    expect(caps.reasoning).toBe(false);
    expect(caps.tools).toBe(false);
    expect(caps.longContext).toBe(false);
    expect(caps.audio).toBe(false);
    expect(caps.code).toBe(false);
    expect(caps.fast).toBe(false);
    expect(caps.multilingual).toBe(false);
  });
});

describe("getActiveCapabilities", () => {
  it("returns array of active capability keys", () => {
    const caps = getActiveCapabilities("gpt-4o");
    expect(caps).toContain("vision");
    expect(caps).toContain("tools");
    expect(Array.isArray(caps)).toBe(true);
  });

  it("returns empty array for unknown model", () => {
    const caps = getActiveCapabilities("totally-unknown-xyz");
    expect(caps).toEqual([]);
  });

  it("includes reasoning for deepseek-r1", () => {
    const caps = getActiveCapabilities("deepseek-r1");
    expect(caps).toContain("reasoning");
  });
});

describe("MODEL_CATEGORIES", () => {
  it("has 'other' as fallback category", () => {
    expect(MODEL_CATEGORIES.other).toBeDefined();
    expect(MODEL_CATEGORIES.other.order).toBe(999);
  });

  it("has all expected categories", () => {
    const expectedKeys = ["claude", "gpt", "o1", "gemini", "deepseek", "llama", "qwen", "mistral", "grok", "cohere", "perplexity", "other"];
    for (const key of expectedKeys) {
      expect(MODEL_CATEGORIES[key]).toBeDefined();
    }
  });
});
