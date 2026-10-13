import { useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard focus for an inline confirmation panel. When it opens (`openKey`
 * becomes truthy, or changes), focus moves to its Cancel button, since the
 * panel is often rendered away from the control that asked for it. When it
 * closes and focus fell to <body> with it, focus goes back to that control,
 * or to `restore()` when the control itself was replaced by the panel.
 */
export function useConfirmationFocus(
  openKey: unknown,
  cancel: RefObject<HTMLElement | null>,
  restore?: () => HTMLElement | null | undefined,
): void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    if (openKey) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      wasOpen.current = true;
      cancel.current?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const previous = opener.current;
    opener.current = null;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    const target = previous?.isConnected ? previous : restoreRef.current?.();
    target?.focus({ preventScroll: true });
  }, [openKey, cancel]);
}
