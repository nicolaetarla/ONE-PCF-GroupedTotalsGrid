/**
 * Browser APIs jsdom does not implement but Fluent UI components touch.
 * Stubs only - no test relies on them doing anything.
 */
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
