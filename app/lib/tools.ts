import type { ToolDefinition } from "./types";

// ─────────────────────────────────────────────
// Tool definitions (sent to the model in `tools` request param)
// ─────────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for up-to-date information using SearXNG. Use this when the user asks about current events, recent news, prices, weather, or any topic where your training data may be outdated. The query should be focused and specific (1-10 keywords). Returns a list of results with titles, URLs, and snippets, plus auto-fetched content from the top 2 results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query. Should be focused, like a Google search.",
          },
          count: {
            type: "number",
            description: "Number of results to return (1-15). Default 8.",
            minimum: 1,
            maximum: 15,
            default: 8,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch and read the content of a specific URL. Use this when the user provides a URL or when you need to read a specific page found via web_search. Returns the page title and extracted text (HTML stripped, max 20000 chars).",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full http(s) URL to fetch.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_chart",
      description:
        "Render an interactive chart (line/bar/area/pie) for the user. Use this when the user requests a visualization or when presenting numerical data benefits from a chart. The chart will appear inline in your response. Do NOT also emit a manual chart code block — using this tool replaces the manual approach.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["line", "bar", "area", "pie"],
            description: "Chart type.",
          },
          title: { type: "string", description: "Optional chart title." },
          xKey: { type: "string", description: "For line/bar/area: data key for X axis." },
          nameKey: { type: "string", description: "For pie: data key for slice name." },
          valueKey: { type: "string", description: "For pie: data key for slice value." },
          series: {
            type: "array",
            description: "For line/bar/area: series definitions.",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                name: { type: "string" },
                color: { type: "string" },
              },
              required: ["key"],
            },
          },
          data: {
            type: "array",
            description: "Array of data point objects.",
            items: { type: "object" },
          },
        },
        required: ["type", "data"],
      },
    },
  },
];

// ─────────────────────────────────────────────
// Tool execution (client-side, called from useChat after tool_calls deltas)
// ─────────────────────────────────────────────

export interface ToolExecutionContext {
  signal?: AbortSignal;
}

export async function executeTool(
  name: string,
  argsJson: string,
  ctx: ToolExecutionContext = {}
): Promise<string> {
  let args: any;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return JSON.stringify({ error: `Invalid JSON arguments: ${argsJson}` });
  }

  switch (name) {
    case "web_search":
      return executeWebSearch(args, ctx);
    case "fetch_url":
      return executeFetchUrl(args, ctx);
    case "render_chart":
      return executeRenderChart(args);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function executeWebSearch(
  args: { query?: string; count?: number },
  ctx: ToolExecutionContext
): Promise<string> {
  if (!args.query || typeof args.query !== "string") {
    return JSON.stringify({ error: "Missing required 'query' parameter" });
  }
  const resp = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: args.query,
      count: typeof args.count === "number" ? args.count : 8,
    }),
    signal: ctx.signal,
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    return JSON.stringify({
      error: `Search failed (HTTP ${resp.status}): ${errBody?.error || "unknown"}`,
      results: [],
    });
  }
  const data = await resp.json();
  // Return a compact JSON string the model can read.
  return JSON.stringify({
    query: data.query,
    count: data.count,
    results: data.results,
  });
}

async function executeFetchUrl(
  args: { url?: string },
  ctx: ToolExecutionContext
): Promise<string> {
  if (!args.url || typeof args.url !== "string") {
    return JSON.stringify({ error: "Missing required 'url' parameter" });
  }
  const resp = await fetch("/api/fetch-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: args.url }),
    signal: ctx.signal,
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    return JSON.stringify({
      error: `Fetch failed (HTTP ${resp.status}): ${errBody?.error || "unknown"}`,
    });
  }
  const data = await resp.json();
  return JSON.stringify({
    url: data.url,
    title: data.title,
    text: data.text,
    truncated: data.truncated,
  });
}

function executeRenderChart(args: any): string {
  // Validate chart spec minimally.
  if (!args || typeof args !== "object") {
    return JSON.stringify({ error: "Invalid chart spec" });
  }
  if (!["line", "bar", "area", "pie"].includes(args.type)) {
    return JSON.stringify({ error: `Unsupported chart type: ${args.type}` });
  }
  if (!Array.isArray(args.data) || args.data.length === 0) {
    return JSON.stringify({ error: "Chart data is empty" });
  }
  // Echo the spec back. The renderer side will see this in the tool result
  // and inject it as a ```chart fenced block in the next assistant turn.
  // We DO NOT auto-emit the chart here — the assistant's next message,
  // which the model writes after seeing this tool result, is where the
  // chart block lives.
  return JSON.stringify({
    ok: true,
    spec: args,
    instruction:
      "Render the chart by including this exact fenced code block in your next response, then briefly explain it:\n```chart\n" +
      JSON.stringify(args) +
      "\n```",
  });
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────

/**
 * Display label for a tool name. Used in the tool invocation card UI.
 */
export function toolDisplayLabel(name: string): string {
  switch (name) {
    case "web_search":
      return "Mencari di web";
    case "fetch_url":
      return "Membaca URL";
    case "render_chart":
      return "Membuat grafik";
    default:
      return name;
  }
}

/**
 * Lucide icon name for a tool. The MessageBubble resolves it.
 */
export function toolIconName(name: string): string {
  switch (name) {
    case "web_search":
      return "Search";
    case "fetch_url":
      return "Link2";
    case "render_chart":
      return "BarChart3";
    default:
      return "Wrench";
  }
}
