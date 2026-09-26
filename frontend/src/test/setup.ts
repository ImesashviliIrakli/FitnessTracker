import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "../lib/validation";
import { MotionGlobalConfig } from "motion/react";

// Tests assert end states, not tweens.
MotionGlobalConfig.skipAnimations = true;

// jsdom has no IntersectionObserver (Card reveals on scroll): report everything as in view at once.
globalThis.IntersectionObserver ??= class {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

afterEach(() => cleanup());
