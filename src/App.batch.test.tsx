// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const { captured, deferreds, createDeferred } = vi.hoisted(() => {
  const captured: string[] = [];
  type Deferred = { promise: Promise<{ blob: Blob }>; resolve: (v: { blob: Blob }) => void };
  const deferreds: Deferred[] = [];
  function createDeferred(): Deferred {
    let resolve!: (v: { blob: Blob }) => void;
    const promise = new Promise<{ blob: Blob }>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }
  return { captured, deferreds, createDeferred };
});

vi.mock("./utils/converter", async () => {
  const actual = await vi.importActual<typeof import("./utils/converter")>("./utils/converter");
  return {
    ...actual,
    convertDataDocument: vi.fn(async (_file: File, targetFormat: string) => {
      captured.push(targetFormat);
      const idx = captured.length;
      if (idx <= 3) {
        return deferreds[idx - 1].promise;
      }
      return { blob: new Blob(["converted"], { type: "text/plain" }) };
    }),
    convertImage: vi.fn(async () => ({
      blob: new Blob(["x"], { type: "image/png" }),
      dimensions: { width: 1, height: 1 },
    })),
    convertAudio: vi.fn(async () => ({
      blob: new Blob(["x"], { type: "audio/wav" }),
      duration: 1,
    })),
  };
});

vi.mock("./utils/serverConvert", async () => {
  const actual = await vi.importActual<typeof import("./utils/serverConvert")>("./utils/serverConvert");
  return {
    ...actual,
    convertServerSide: vi.fn(async () => new Blob(["x"], { type: "video/mp4" })),
    needsServerConversion: () => false,
  };
});

import App from "./App";
import { convertDataDocument } from "./utils/converter";

const convertDataMock = vi.mocked(convertDataDocument);

beforeEach(() => {
  captured.length = 0;
  deferreds.length = 0;
  for (let i = 0; i < 3; i++) deferreds.push(createDeferred());
  convertDataMock.mockClear();
  // jsdom lacks createObjectURL — spy instead of replacing URL constructor
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:fake-${Math.random()}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("batch Convert All stale closure (BUG-01)", () => {
  it("honors targetFormat edit made to a still-pending item during batch", async () => {
    const user = userEvent.setup();
    render(<App />);

    // add 4 data files via the sample button (avoids File input flakiness)
    const sampleBtn = screen.getByRole("button", { name: /Sample JSON Dataset/i });
    await user.click(sampleBtn);
    await user.click(sampleBtn);
    await user.click(sampleBtn);
    await user.click(sampleBtn);

    // queue appears — sample files are named like sample-*.json
    await waitFor(() => expect(screen.getAllByLabelText(/Choose output format/).length).toBe(4));

    // default target for json is csv — verify triggers show csv
    const triggersBefore = screen.getAllByLabelText(/Choose output format/);
    expect(triggersBefore).toHaveLength(4);
    triggersBefore.forEach((btn) => expect(btn).toHaveTextContent(/csv/i));

    const convertAllBtn = screen.getByRole("button", { name: /Convert All/i });
    await user.click(convertAllBtn);

    // first 3 conversions start immediately (concurrency 3), 4th stays pending
    await waitFor(() => expect(convertDataMock).toHaveBeenCalledTimes(3));
    expect(captured).toEqual(["csv", "csv", "csv"]);
    expect(convertDataMock).toHaveBeenCalledTimes(3); // 4th not yet started

    // edit pending item via global format selector (native <select>, avoids portal flakiness)
    // This still hits handleApplyGlobalFormat -> setQueue functional update, same stale path.
    const globalSelect = screen.getByLabelText(/Set all file formats/i) as HTMLSelectElement;
    await user.selectOptions(globalSelect, "xml");
    // verify UI updated: all triggers now show xml (global change)
    await waitFor(() => {
      const triggers = screen.getAllByLabelText(/Choose output format/);
      expect(triggers[3]).toHaveTextContent(/xml/i);
    });

    // release first 3 conversions
    const fakeBlob = { blob: new Blob(["converted"], { type: "text/xml" }) };
    deferreds.forEach((d) => d.resolve(fakeBlob as { blob: Blob }));

    // 4th conversion should now start with the edited format
    await waitFor(() => expect(convertDataMock).toHaveBeenCalledTimes(4), { timeout: 3000 });

    // BUG-01: with stale closure this is "csv"; fixed it must be "xml"
    expect(captured[3]).toBe("xml");
  });
});
