import { describe, it, expect } from "vitest";
import { activeProgressChannels, publishProgress, subscribeProgress } from "./progress";

describe("progress fan-out", () => {
  it("delivers published percentages to subscribers of the same id", () => {
    const received: number[] = [];
    const unsubscribe = subscribeProgress("test-channel", (p) => received.push(p));

    publishProgress("test-channel", 10);
    publishProgress("other-channel", 50);
    publishProgress("test-channel", 42);

    expect(received).toEqual([10, 42]);
    unsubscribe();
    expect(activeProgressChannels()).toBe(0);
  });

  it("stops delivering after unsubscribe", () => {
    const received: number[] = [];
    const unsubscribe = subscribeProgress("test-unsub", (p) => received.push(p));
    unsubscribe();

    publishProgress("test-unsub", 99);
    expect(received).toEqual([]);
  });
});
