import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SteelRestClientAdapter } from "../src/adapters/rest/steel-rest-client.adapter.js";
import { SteelSessionError, SteelUnavailableError } from "../src/domain/errors.js";

const BASE_URL = "http://steel-browser:3000";

function mockFetch(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: response.json ?? (() => Promise.resolve({})),
    text: response.text ?? (() => Promise.resolve("")),
  });
}

describe("SteelRestClientAdapter", () => {
  let adapter: SteelRestClientAdapter;

  beforeEach(() => {
    adapter = new SteelRestClientAdapter({ baseUrl: BASE_URL });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSession", () => {
    it("creates a session and returns sessionId, debugUrl, websocketUrl", async () => {
      const mockResponse = {
        id: "sess-123",
        debugUrl: "https://steel:9223/devtools/sess-123",
        websocketUrl: "ws://steel:9223/devtools/sess-123",
        status: "active",
      };

      vi.stubGlobal(
        "fetch",
        mockFetch({ ok: true, status: 200, json: () => Promise.resolve(mockResponse) }),
      );

      const result = await adapter.createSession({ profileKey: "conn-uuid-1" });

      expect(result).toEqual({
        sessionId: "sess-123",
        debugUrl: "https://steel:9223/devtools/sess-123",
        websocketUrl: "ws://steel:9223/devtools/sess-123",
      });

      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/v1/sessions`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("falls back to wsUrl if websocketUrl is missing", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "sess-456",
              debugUrl: "https://debug",
              wsUrl: "ws://fallback",
              status: "active",
            }),
        }),
      );

      const result = await adapter.createSession({ profileKey: "conn-uuid-2" });
      expect(result.websocketUrl).toBe("ws://fallback");
    });

    it("throws SteelUnavailableError on network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      );

      await expect(
        adapter.createSession({ profileKey: "conn-uuid-3" }),
      ).rejects.toThrow(SteelUnavailableError);
    });

    it("throws SteelSessionError on non-2xx response", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch({
          ok: false,
          status: 500,
          text: () => Promise.resolve("internal error"),
        }),
      );

      await expect(
        adapter.createSession({ profileKey: "conn-uuid-4" }),
      ).rejects.toThrow(SteelSessionError);
    });

    it("throws SteelSessionError if websocketUrl is missing from response", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ id: "sess-789", debugUrl: "https://debug", status: "active" }),
        }),
      );

      await expect(
        adapter.createSession({ profileKey: "conn-uuid-5" }),
      ).rejects.toThrow(SteelSessionError);
    });
  });

  describe("releaseSession", () => {
    it("releases a session successfully", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: true, status: 200 }));

      await expect(adapter.releaseSession("sess-123")).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/v1/sessions/sess-123`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("accepts 404 (session already timed out)", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: false, status: 404 }));

      await expect(adapter.releaseSession("sess-expired")).resolves.toBeUndefined();
    });

    it("throws SteelUnavailableError on network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      );

      await expect(adapter.releaseSession("sess-123")).rejects.toThrow(
        SteelUnavailableError,
      );
    });

    it("throws SteelSessionError on non-2xx/404 response", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch({
          ok: false,
          status: 500,
          text: () => Promise.resolve("server error"),
        }),
      );

      await expect(adapter.releaseSession("sess-123")).rejects.toThrow(
        SteelSessionError,
      );
    });
  });
});
