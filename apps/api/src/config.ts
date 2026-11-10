export const DEFAULT_HOSTNAME = "127.0.0.1";

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export type ApiConfig = {
  dbPath: string;
  port: number;
  /** Interface the self-hosted Bun server binds to; loopback by default. */
  hostname?: string;
  apiToken?: string;
  /**
   * Refuse first-owner setup without a token from any host. The Worker sets
   * this: there, no Host header proves the request came from this machine.
   */
  refuseTokenlessSetup?: boolean;
  defaultPlanId: string;
  /** Operator-controlled YNAB API base URL for `/api/import/ynab`; never taken from request bodies. */
  ynabBaseUrl?: string;
  /** TypeSafe API key for Jev category suggestions; the feature is off without it. */
  typesafeApiKey?: string;
  /** TypeSafe model override; the SDK defaults to `jev-latest`. */
  typesafeModel?: string;
  /**
   * IANA zone that decides "today" for date-relative reads such as
   * `card_payments`. The Worker and the phone always set it; the Bun server
   * reads HOWMUCH_TIME_ZONE and otherwise uses the host's zone.
   */
  timeZone?: string;
};

export function loadConfig(env: Record<string, string | undefined> = Bun.env): ApiConfig {
  const hostname = emptyToUndefined(env.HOWMUCH_HOST)?.replace(/^\[|\]$/g, "") || DEFAULT_HOSTNAME;
  return {
    dbPath: env.HOWMUCH_DB_PATH ?? "data/howmuch.sqlite",
    port: Number(env.PORT ?? env.HOWMUCH_PORT ?? "8787"),
    hostname,
    apiToken: emptyToUndefined(env.HOWMUCH_API_TOKEN),
    defaultPlanId: env.HOWMUCH_DEFAULT_PLAN_ID ?? "local-plan",
    ynabBaseUrl: emptyToUndefined(env.HOWMUCH_YNAB_BASE_URL),
    typesafeApiKey: emptyToUndefined(env.TYPESAFE_API_KEY),
    typesafeModel: emptyToUndefined(env.TYPESAFE_MODEL),
    timeZone: emptyToUndefined(env.HOWMUCH_TIME_ZONE),
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
