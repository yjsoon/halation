// Shared helpers for the round 3 Worker/API E2E scripts. They talk to a local
// `wrangler dev --env preview --local` stack only; see NOTES.md.
export const BASE = process.env.BASE ?? "http://127.0.0.1:8833";
export const PLAN = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
export const TOKEN = process.env.TOKEN ?? "local-e2e-token";

export async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: response.status, json };
}

export const plan = (path: string) => `/v1/plans/${PLAN}${path}`;
export const run = Date.now().toString(36);
