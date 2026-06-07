// Wireframe spec contract shared between the renderer and the system prompt.
// The AI emits a JSON tree (NO pixel coordinates) — layout is computed by the
// browser via flex/grid. Keep this in sync with the `## Wireframes` section in
// app/lib/types.ts.

export type WTextSize = "xs" | "sm" | "base" | "lg" | "xl" | "2xl";

/**
 * A single wireframe node. Container nodes carry `children`; leaf nodes don't.
 * Extra fields are allowed (and ignored) so a slightly-off spec still renders.
 */
export interface WNode {
  type: string;
  children?: WNode[];
  [key: string]: unknown;
}

/** Root node. Always `type: "screen"`. */
export interface WireframeSpec {
  type: "screen";
  title?: string;
  width?: "phone" | "tablet" | "desktop" | "auto"; // default "auto"
  children?: WNode[];
}

// Defensive guards: layout is computed by us (not a library), so a pathological
// spec could otherwise blow up the render. These keep it bounded.
export const MAX_DEPTH = 6;
export const MAX_NODES = 150;

/** Whitelisted node types. Anything else is ignored by the renderer. */
export const KNOWN_TYPES = new Set<string>([
  // containers
  "row",
  "col",
  "card",
  "grid",
  "navbar",
  "appbar",
  "bottomnav",
  "tabs",
  "list",
  "header",
  "sidebar",
  "footer",
  "table",
  "chartph",
  // leaves
  "logo",
  "heading",
  "text",
  "input",
  "button",
  "image",
  "avatar",
  "checkbox",
  "radio",
  "toggle",
  "link",
  "divider",
  "badge",
  "spacer",
  "icon",
  "searchbar",
  "chips",
  "stat",
  "listitem",
  "progress",
  "rating",
  "alert",
  "fab",
]);

/** Count total nodes in a tree (used to enforce MAX_NODES before rendering). */
export function countNodes(nodes: WNode[] | undefined, depth = 0): number {
  if (!Array.isArray(nodes) || depth > MAX_DEPTH) return 0;
  let total = 0;
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    total += 1;
    if (Array.isArray(n.children)) {
      total += countNodes(n.children, depth + 1);
    }
  }
  return total;
}

/** Clamp a value to an integer range, with a fallback for non-numbers. */
export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = typeof value === "number" ? Math.floor(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Coerce an unknown value to a trimmed string (empty if not stringy). */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
