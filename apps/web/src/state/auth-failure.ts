import { ApiError } from "../api/client";

/**
 * The sign-in and setup error to show. A server failure with no Halation
 * detail is most likely the platform refusing the request: on the Workers
 * Free plan, password hashing exceeds the CPU limit (see Costs in
 * docs/self-hosting.md).
 */
export function describeAuthFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (cause instanceof ApiError && cause.status >= 500 && cause.detail === undefined) {
    return `${message} If this server runs on the Cloudflare Workers Free plan, setup and sign-in exceed its CPU limit: Halation needs the Workers Paid plan.`;
  }
  return message;
}
