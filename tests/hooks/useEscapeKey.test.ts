import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useEscapeKey } from "@/hooks/useEscapeKey";

function dispatchKey(key: string) {
  const event = new KeyboardEvent("keydown", { key });
  window.dispatchEvent(event);
}

describe("useEscapeKey", () => {
  it("calls handler when Escape is pressed", () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler));

    dispatchKey("Escape");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for other keys", () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler));

    dispatchKey("Enter");
    dispatchKey("a");
    dispatchKey(" ");
    dispatchKey("Tab");

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(handler));

    dispatchKey("Escape");
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();

    dispatchKey("Escape");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not register listener when enabled is false", () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler, false));

    dispatchKey("Escape");

    expect(handler).not.toHaveBeenCalled();
  });

  it("respects enabled flag toggling between renders", () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useEscapeKey(handler, enabled),
      { initialProps: { enabled: true } },
    );

    dispatchKey("Escape");
    expect(handler).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    dispatchKey("Escape");
    expect(handler).toHaveBeenCalledTimes(1);

    rerender({ enabled: true });
    dispatchKey("Escape");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("handles null handler safely", () => {
    expect(() => {
      renderHook(() => useEscapeKey(null));
      dispatchKey("Escape");
    }).not.toThrow();
  });

  it("handles undefined handler safely", () => {
    expect(() => {
      renderHook(() => useEscapeKey(undefined));
      dispatchKey("Escape");
    }).not.toThrow();
  });

  it("uses the latest handler when handler reference changes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ h }: { h: () => void }) => useEscapeKey(h),
      { initialProps: { h: first } },
    );

    dispatchKey("Escape");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    rerender({ h: second });

    dispatchKey("Escape");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
