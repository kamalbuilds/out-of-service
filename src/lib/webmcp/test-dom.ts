/**
 * The smallest DOM `@mcp-b/webmcp-polyfill` will install into, for running the WebMCP
 * lifecycle tests under vitest's node environment (no jsdom in this project).
 *
 * The polyfill needs: a window/document pair where `document.defaultView.document === document`
 * (its "fully active" check), a string `origin` (its executable-origin check), constructors it
 * does `instanceof` against, and MutationObserver for the declarative-form observer.
 * Nothing here fakes WebMCP itself: `document.modelContext` is the real polyfill.
 */

class FakeNode extends EventTarget {}
class FakeElement extends FakeNode {}
class FakeHTMLFormElement extends FakeElement {}
class FakeShadowRoot extends FakeNode {}
class FakeDocument extends FakeNode {
  title = "Out of Service (test)";
  get defaultView() {
    return globalThis as unknown as Window;
  }
  querySelectorAll() {
    return [] as unknown as NodeListOf<Element>;
  }
}
class FakeSubmitEvent extends Event {}
class FakeMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

type Installed = { target: object; key: string; previous: PropertyDescriptor | undefined };
const installed: Installed[] = [];

function define(target: object, key: string, value: unknown) {
  installed.push({ target, key, previous: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
}

export const TEST_ORIGIN = "https://out-of-service.test";

/** Install the shim. Call before `initializeWebMCPPolyfill()`. */
export function installTestDom() {
  const g = globalThis as Record<string, unknown>;

  const doc = new FakeDocument();

  define(g, "origin", TEST_ORIGIN);
  define(g, "window", globalThis);
  // A top-level window is its own parent; without this the polyfill treats us as a
  // cross-origin frame and refuses to register (NotAllowedError).
  define(g, "parent", globalThis);
  define(g, "top", globalThis);
  define(g, "document", doc);
  define(g, "Node", FakeNode);
  // The polyfill installs its modelContext getter on Document.prototype, so the constructor
  // has to exist and our document has to be an instance of it.
  define(g, "Document", FakeDocument);
  define(g, "Element", FakeElement);
  define(g, "HTMLFormElement", FakeHTMLFormElement);
  define(g, "ShadowRoot", FakeShadowRoot);
  define(g, "MutationObserver", FakeMutationObserver);
  if (typeof (g as { SubmitEvent?: unknown }).SubmitEvent === "undefined") {
    define(g, "SubmitEvent", FakeSubmitEvent);
  }
  if (typeof (g as { navigator?: unknown }).navigator === "undefined") {
    define(g, "navigator", {});
  }
}

/** Undo the shim, innermost first. */
export function uninstallTestDom() {
  for (const { target, key, previous } of [...installed].reverse()) {
    if (previous) Object.defineProperty(target, key, previous);
    else Reflect.deleteProperty(target, key);
  }
  installed.length = 0;
}
