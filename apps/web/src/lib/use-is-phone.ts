import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 720px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const isPhone = () => window.matchMedia?.(PHONE_QUERY).matches ?? false;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}
