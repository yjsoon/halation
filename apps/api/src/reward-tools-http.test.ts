import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { openD1Sqlite } from "./sqlite-d1";
import { d1Handler, d1Repo } from "../tests/helpers/native-harness";

test("native tools require authentication, same-origin CSRF, and plan permission before parsing", async () => {
  const db = openD1Sqlite();
  const handler = d1Handler(db, { config: { dbPath: ":memory:", port: 0, apiToken: "test-token", defaultPlanId: "test-plan" } });
  try {
    for (const route of ["reward-terms", "statement-formatter"]) {
      const request = (headers: Record<string, string>, plan = "test-plan") => handler(new Request(`https://howmuch.test/api/tools/${route}?plan_id=${plan}`, { method: "POST", headers, body: "not JSON" }));
      expect((await request({ origin: "https://howmuch.test" })).status).toBe(401);
      expect((await request({ authorization: "Bearer test-token" })).status).toBe(403);
      expect((await request({ authorization: "Bearer test-token", origin: "https://evil.test" })).status).toBe(403);
      expect((await request({ authorization: "Bearer test-token", origin: "https://howmuch.test" }, "other-plan")).status).toBe(404);
      const allowed = await request({ authorization: "Bearer test-token", origin: "https://howmuch.test" });
      expect(allowed.status).toBe(400);
      expect((await allowed.json()).error.detail).toContain("Invalid JSON");
    }
  } finally { db.close(); }
});
