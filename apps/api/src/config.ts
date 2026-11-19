export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export type ApiConfig = {
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
   * `card_payments`. The Worker and the phone always set it.
   */
  timeZone?: string;
};
