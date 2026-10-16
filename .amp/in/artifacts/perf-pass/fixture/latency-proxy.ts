#!/usr/bin/env bun
// Minimal reverse proxy that adds a fixed delay to every request.
//
//   bun latency-proxy.ts <listen_port> <target_origin> <latency_ms>
//   e.g. bun latency-proxy.ts 8788 http://127.0.0.1:8787 120
//
// Each request waits latency_ms, then is forwarded unchanged (method, path,
// query, headers, body) to the target; the response streams back as is. The
// delay is paid once per request, so it models a round trip, not each way.
// Listens on 127.0.0.1 only. serve.sh starts and stops it.

const [portArg, targetArg, latencyArg] = process.argv.slice(2);
const port = Number(portArg);
const latency = Number(latencyArg ?? 0);
if (!Number.isInteger(port) || port <= 0 || !targetArg || !Number.isFinite(latency) || latency < 0) {
  console.error("usage: bun latency-proxy.ts <listen_port> <target_origin> <latency_ms>");
  process.exit(2);
}
const target = new URL(targetArg);

// Hop-by-hop headers are not forwarded; fetch sets host and length itself.
const HOP = ["host", "connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer", "content-length"];

Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 120,
  async fetch(request) {
    if (latency > 0) await Bun.sleep(latency);
    const incoming = new URL(request.url);
    const destination = new URL(incoming.pathname + incoming.search, target);
    const headers = new Headers(request.headers);
    for (const name of HOP) headers.delete(name);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    let response: Response;
    try {
      response = await fetch(destination, {
        method: request.method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
        redirect: "manual",
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: { id: "502", name: "bad_gateway", detail: String(error) } }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
    // fetch has already decoded any content-encoding, so its header and the
    // original length no longer describe the body we pass on.
    const outgoing = new Headers(response.headers);
    for (const name of [...HOP, "content-encoding"]) outgoing.delete(name);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing });
  },
});

console.log(`latency proxy 127.0.0.1:${port} -> ${target.origin} (+${latency} ms per request)`);
