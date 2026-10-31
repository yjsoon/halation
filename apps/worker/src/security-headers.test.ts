import { describe, expect, test } from "bun:test";
import { withDocumentSecurityHeaders, withTransportSecurity } from "./security-headers";

describe("withDocumentSecurityHeaders", () => {
  test("pins a restrictive CSP and clickjacking protections", () => {
    const response = withDocumentSecurityHeaders(new Response("<html></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-eval");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  test("does not disable caching for hashed static assets", () => {
    const response = withDocumentSecurityHeaders(new Response("ok", {
      headers: { "content-type": "text/javascript", "cache-control": "public, max-age=31536000, immutable" },
    }));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });
});

describe("withTransportSecurity", () => {
  test("pins HTTPS on API responses without document-only headers", async () => {
    const response = withTransportSecurity(new Response('{"ok":true}', {
      status: 201,
      headers: { "content-type": "application/json", "set-cookie": "a=b" },
    }));
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBe("a=b");
    expect(await response.text()).toBe('{"ok":true}');
  });
});
