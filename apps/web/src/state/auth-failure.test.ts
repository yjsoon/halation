import { describe, expect, test } from "bun:test";
import { ApiError, api } from "../api/client";
import { describeAuthFailure } from "./auth-failure";

// Failure mode: on the Workers Free plan, password hashing exceeds the CPU
// limit and Cloudflare answers with its own error page (a 5xx, here 503),
// not Halation's JSON. Over HTTP/2 the status text is empty, so the old
// message was a bare "503 ".
describe("non-JSON server failures during sign-in", () => {
  test("read as a sentence that points at the plan limit", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("<html>Error 1102</html>", {
      status: 503,
      statusText: "",
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
    try {
      const failure = await api.login("owner", "a-long-enough-password").catch((cause: unknown) => cause);
      expect(failure).toBeInstanceOf(ApiError);
      const message = describeAuthFailure(failure);
      expect(message.startsWith("The server could not complete the request (HTTP 503).")).toBeTrue();
      expect(message).toContain("Workers Paid plan");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
