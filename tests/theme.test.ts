import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setTheme, toggleTheme } from "../lib/theme";
import ThemeToggle from "../components/theme-toggle";

const controller = { setTheme, toggleTheme };
let stored: Map<string, string>;
let classes: Set<string>;
let style: { colorScheme: string };
let systemDark: boolean;
let transitionSuppressedDuringPaint: boolean[];
let originalGlobals: Map<string, PropertyDescriptor | undefined>;

beforeEach(() => {
  stored = new Map();
  classes = new Set();
  style = { colorScheme: "" };
  systemDark = false;
  transitionSuppressedDuringPaint = [];
  originalGlobals = new Map();
  const browserWindow = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: systemDark }),
  });
  const globals = {
    window: browserWindow,
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name),
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
          contains: (name: string) => classes.has(name),
        },
        getBoundingClientRect: () => transitionSuppressedDuringPaint.push(classes.has("theme-changing")),
        style,
      },
    },
    localStorage: {
      getItem: (name: string) => stored.get(name) ?? null,
      setItem: (name: string, value: string) => stored.set(name, value),
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
});

afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test("a selected theme immediately updates the document and native color scheme", () => {
  controller.setTheme("dark");
  assert.equal(classes.has("dark"), true);
  assert.equal(classes.has("light"), false);
  assert.equal(style.colorScheme, "dark");
  assert.equal(stored.get("theme"), "dark");

  controller.setTheme("light");
  assert.equal(classes.has("light"), true);
  assert.equal(classes.has("dark"), false);
  assert.equal(style.colorScheme, "light");
  assert.ok(transitionSuppressedDuringPaint.length > 0);
  assert.ok(transitionSuppressedDuringPaint.every(Boolean));
  assert.equal(classes.has("theme-changing"), false);
});

test("rapid toggles read the current theme instead of the last rendered snapshot", () => {
  controller.setTheme("light");
  controller.toggleTheme();
  controller.toggleTheme();
  assert.equal(stored.get("theme"), "light");
  assert.equal(classes.has("light"), true);

  for (let index = 0; index < 21; index++) controller.toggleTheme();
  assert.equal(stored.get("theme"), "dark");
  assert.equal(classes.has("dark"), true);
});

test("system preference resolves immediately while preserving the saved system setting", () => {
  systemDark = true;
  controller.setTheme("system");
  assert.equal(stored.get("theme"), "system");
  assert.equal(classes.has("dark"), true);
  assert.equal(style.colorScheme, "dark");

  controller.toggleTheme();
  assert.equal(stored.get("theme"), "light");
  assert.equal(classes.has("light"), true);
});

test("server rendering reserves the theme control without reading browser preferences", () => {
  Object.defineProperty(globalThis, "window", { configurable: true, get: () => { throw new Error("window unavailable during SSR"); } });
  const html = renderToStaticMarkup(createElement(ThemeToggle));
  assert.match(html, /<button/);
  assert.match(html, /disabled/);
  assert.match(html, /aria-label="切换主题"/);
});
