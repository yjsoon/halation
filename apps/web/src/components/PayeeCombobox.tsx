import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { PayeeListEntry } from "../lib/register-row-edit";

// Rendering every payee would mean thousands of rows on a long-lived plan.
// Typing narrows the list, so a cap costs nothing in reach.
const PAYEE_LIMIT = 60;

type Placement = { left: number; top: number; width: number; maxHeight: number; above: boolean };

function matchKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Transfers first, then payees; prefix matches ahead of other matches. */
export function payeeMenuSections(entries: readonly PayeeListEntry[], query: string) {
  const key = matchKey(query);
  const rank = (text: string) => {
    if (!key) return 0;
    const at = text.toLowerCase().indexOf(key);
    if (at < 0) return -1;
    return at === 0 ? 0 : 1;
  };
  const transfers: { entry: PayeeListEntry; rank: number }[] = [];
  const payees: { entry: PayeeListEntry; rank: number }[] = [];
  for (const entry of entries) {
    if (entry.transferAccount !== undefined) {
      const scores = [rank(entry.transferAccount), rank(entry.value)].filter((score) => score >= 0);
      if (scores.length) transfers.push({ entry, rank: Math.min(...scores) });
    } else {
      const score = rank(entry.value);
      if (score >= 0) payees.push({ entry, rank: score });
    }
  }
  const byRank = (a: { rank: number }, b: { rank: number }) => a.rank - b.rank;
  transfers.sort(byRank);
  payees.sort(byRank);
  return {
    transfers: transfers.map((item) => item.entry),
    payees: payees.slice(0, PAYEE_LIMIT).map((item) => item.entry),
    morePayees: Math.max(0, payees.length - PAYEE_LIMIT),
  };
}

function TransferGlyph(): ReactElement {
  return (
    <svg className="payee-menu-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M2.5 5h10m0 0L10 2.5M12.5 5 10 7.5M13.5 11h-10m0 0L6 8.5M3.5 11 6 13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Payee field for the register: free text, with a styled list of transfer
 * accounts and known payees beneath it. Replaces a native <datalist>, which
 * browsers draw in their own chrome and which hid transfers in a long list.
 */
export function PayeeCombobox({
  id,
  value,
  entries,
  disabled,
  focusKey,
  onChange,
  onCommitName,
}: {
  id: string;
  value: string;
  entries: readonly PayeeListEntry[];
  disabled: boolean;
  /** Written to data-row-focus so the row editor can focus this field. */
  focusKey?: string;
  onChange: (value: string) => void;
  /** Called on blur so the caller can snap the text to a known payee. */
  onCommitName: () => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  // What the list is filtered by. Empty right after opening, so a field that
  // already holds a payee still shows every choice.
  const [query, setQuery] = useState("");
  // -1 means nothing highlighted: Enter then keeps the typed text and saves
  // the row, so a new payee is never swapped for a similar known one.
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const sections = useMemo(() => payeeMenuSections(entries, query), [entries, query]);
  const options = useMemo(() => [...sections.transfers, ...sections.payees], [sections]);
  const showing = open && !disabled && options.length > 0;

  useEffect(() => {
    setActive((current) => Math.min(current, options.length - 1));
  }, [options.length]);

  useLayoutEffect(() => {
    if (!showing) {
      setPlacement(null);
      return;
    }
    const place = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const gap = 6;
      const margin = 12;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const aboveRoom = rect.top - gap - margin;
      const flip = below < 200 && aboveRoom > below;
      const width = Math.min(Math.max(rect.width, 300), 420, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
      setPlacement({
        left,
        top: flip ? rect.top - gap : rect.bottom + gap,
        width,
        maxHeight: Math.max(120, Math.min(340, flip ? aboveRoom : below)),
        above: flip,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showing]);

  useEffect(() => {
    if (!showing || active < 0) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, showing]);

  const openMenu = () => {
    if (disabled || open) return;
    setQuery("");
    setActive(-1);
    setOpen(true);
  };

  const choose = (entry: PayeeListEntry) => {
    onChange(entry.value);
    setOpen(false);
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  let index = -1;
  const renderOption = (entry: PayeeListEntry) => {
    index += 1;
    const at = index;
    const transfer = entry.transferAccount !== undefined;
    return (
      <div
        key={entry.id}
        id={optionId(at)}
        role="option"
        aria-selected={at === active}
        data-option-index={at}
        className={`payee-menu-option${transfer ? " payee-menu-transfer" : ""}${at === active ? " is-active" : ""}`}
        // Keep focus in the input so blur does not close the list first.
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => {
          if (active !== at) setActive(at);
        }}
        onClick={() => choose(entry)}
      >
        {transfer ? <TransferGlyph /> : null}
        <span className="payee-menu-name">{transfer ? entry.transferAccount : entry.value}</span>
      </div>
    );
  };

  const menu = showing && placement
    ? createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        aria-label="Payees"
        className={`payee-menu${placement.above ? " payee-menu-above" : ""}`}
        style={{
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          ...(placement.above ? { bottom: window.innerHeight - placement.top } : { top: placement.top }),
        }}
      >
        {sections.transfers.length > 0 && (
          <div role="group" aria-labelledby={`${listId}-transfers`}>
            <div className="payee-menu-heading" id={`${listId}-transfers`} role="presentation">Transfer</div>
            {sections.transfers.map(renderOption)}
          </div>
        )}
        {sections.payees.length > 0 && (
          <div role="group" aria-labelledby={`${listId}-payees`}>
            <div className="payee-menu-heading" id={`${listId}-payees`} role="presentation">
              Payees
            </div>
            {sections.payees.map(renderOption)}
          </div>
        )}
        {sections.morePayees > 0 && (
          <div className="payee-menu-more" role="presentation">
            {sections.morePayees} more · keep typing to narrow
          </div>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        data-row-focus={focusKey}
        className="payee-combobox-input"
        type="text"
        name="payee"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={showing ? listId : undefined}
        aria-activedescendant={showing && options[active] ? optionId(active) : undefined}
        value={value}
        autoComplete="off"
        placeholder="Payee"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onBlur={() => {
          setOpen(false);
          onCommitName();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === "Enter") event.stopPropagation();
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!showing) {
              openMenu();
              return;
            }
            const last = options.length - 1;
            setActive((current) => event.key === "ArrowDown"
              ? (current >= last ? 0 : current + 1)
              : (current <= 0 ? last : current - 1));
            return;
          }
          if (event.key === "Enter" && showing && options[active]) {
            // Pick the highlighted entry; the row saves on the next Enter.
            event.preventDefault();
            event.stopPropagation();
            choose(options[active]);
            return;
          }
          if (event.key === "Escape" && showing) {
            // Close the list without cancelling the whole row.
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (event.key === "Tab") {
            setOpen(false);
          }
        }}
      />
      {menu}
    </>
  );
}
