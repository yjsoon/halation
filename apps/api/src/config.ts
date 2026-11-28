export type ApiConfig = {
  apiToken?: string;
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
