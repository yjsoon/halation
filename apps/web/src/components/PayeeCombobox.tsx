import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { PayeeListEntry } from "../lib/register-row-edit";

// Rendering every payee would mean thousands of rows on a long-lived plan.
// Typing narrows the list, so a cap costs nothing in reach.
const PAYEE_LIMIT = 60;

type Placement = { left: number; top: number; width: number; maxHeight: number; above: boolean };

const collator = new Intl.Collator(undefined, { sensitivity: "base", ignorePunctuation: true });

// Bank imports often lead with card digits ("-1234 SHOP NAME CITY SG").
const CARD_PREFIX = /^-\d{2,}\s+/;
const COUNTRY_SUFFIX = /\s+[A-Z]{2}$/;

function matchKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A raw bank string: letters, none of them lower case. */
function isShouting(name: string): boolean {
  return /[A-Z]/.test(name) && !/[a-z]/.test(name);
}

/** 0 for a match at the start of a word, 1 elsewhere, -1 for no match. */
function matchRank(text: string, key: string): number {
  if (!key) return 0;
  const haystack = matchKey(text);
  let at = haystack.indexOf(key);
  let rank = -1;
  while (at >= 0) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(haystack[at - 1]!)) return 0;
    rank = 1;
    at = haystack.indexOf(key, at + 1);
  }
  return rank;
}

/**
 * Transfers first, then payees. Word-start matches lead; names the owner has
 * tidied come before raw bank strings; card digits do not decide the order.
 */
export function payeeMenuSections(entries: readonly PayeeListEntry[], query: string) {
  const key = matchKey(query);
  type Ranked = { entry: PayeeListEntry; rank: number; raw: number; sort: string };
  const transfers: Ranked[] = [];
  const payees: Ranked[] = [];
  for (const entry of entries) {
    if (entry.transferAccount !== undefined) {
      // Match the account name. The "Transfer : " prefix only counts once the
      // query clearly asks for it, or "a" would match every transfer.
      const prefixRank = key.length >= 3 ? matchRank(entry.value, key) : -1;
      // Word starts only: a letter inside an account name is too weak a reason
      // to put transfers above the payee being typed.
      if (matchRank(entry.transferAccount, key) === 0 || prefixRank === 0) {
        transfers.push({ entry, rank: 0, raw: 0, sort: entry.transferAccount });
      }
    } else {
      const rank = matchRank(entry.value, key);
      if (rank >= 0) {
        payees.push({ entry, rank, raw: isShouting(entry.value) ? 1 : 0, sort: entry.value.replace(CARD_PREFIX, "") });
      }
    }
  }
  const order = (a: Ranked, b: Ranked) => a.rank - b.rank || a.raw - b.raw || collator.compare(a.sort, b.sort);
  transfers.sort(order);
  payees.sort(order);
  return {
    transfers: transfers.map((item) => item.entry),
    payees: payees.slice(0, PAYEE_LIMIT).map((item) => item.entry),
    morePayees: Math.max(0, payees.length - PAYEE_LIMIT),
  };
}

/** Shows a raw bank string quietly; the text stays exactly the payee name. */
function PayeeName({ name }: { name: string }): ReactElement {
  if (!isShouting(name)) {
    return <span className="payee-menu-name">{name}</span>;
  }
  const prefix = name.match(CARD_PREFIX)?.[0] ?? "";
  const rest = name.slice(prefix.length);
  // A trailing country code is only noise on a card-prefixed bank string.
  const suffix = prefix ? (rest.match(COUNTRY_SUFFIX)?.[0] ?? "") : "";
  const body = rest.slice(0, rest.length - suffix.length);
  return (
    <span className="payee-menu-name">
      {prefix ? <span className="payee-menu-noise">{prefix}</span> : null}
      <span className="payee-menu-raw">{body}</span>
      {suffix ? <span className="payee-menu-noise">{suffix}</span> : null}
    </span>
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
  required,
  onChange,
  onCommitName,
}: {
  id: string;
  value: string;
  entries: readonly PayeeListEntry[];
  disabled: boolean;
  /** Written to data-row-focus so the row editor can focus this field. */
  focusKey?: string;
  required?: boolean;
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
  // Showing and placed: hidden while the field is scrolled out of its table,
  // and then neither announced nor driven by the keyboard.
  const visible = showing && placement !== null;

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
      // Hide the list while the field is scrolled out of its table, rather
      // than leave it floating over other columns.
      const clip = input.closest(".table-wrap")?.getBoundingClientRect();
      if (clip && (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom)) {
        setPlacement(null);
        return;
      }
      // The visual viewport excludes an on-screen keyboard.
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop ?? 0;
      const viewBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const gap = 6;
      const margin = 12;
      const below = viewBottom - rect.bottom - gap - margin;
      const aboveRoom = rect.top - viewTop - gap - margin;
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
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [showing]);

  // A save started with Enter disables the field; if it fails, the list
  // should not pop back open on its own.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Only keyboard moves scroll the list. Scrolling under a hovering pointer
  // would move a different option beneath it and set off a loop.
  const keyboardMove = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    if (!showing || active < 0) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, showing]);

  const openMenu = () => {
    if (disabled || showing) return;
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
        aria-label={transfer ? `Transfer: ${entry.transferAccount}` : undefined}
        data-option-index={at}
        className={`payee-menu-option${transfer ? " payee-menu-transfer" : ""}${at === active ? " is-active" : ""}`}
        onMouseMove={(event) => {
          // Scrolling by keyboard fires a mousemove under a still pointer;
          // only a real pointer move should take the highlight.
          const last = pointer.current;
          pointer.current = { x: event.clientX, y: event.clientY };
          if (last && last.x === event.clientX && last.y === event.clientY) return;
          if (active !== at) setActive(at);
        }}
        onClick={() => choose(entry)}
      >
        {transfer ? (
          <>
            <span className="payee-menu-icon" aria-hidden="true">{entry.transferAccountIcon}</span>
            <span className="payee-menu-name">{entry.transferAccount}</span>
          </>
        ) : (
          <PayeeName name={entry.value} />
        )}
      </div>
    );
  };

  const menu = visible && placement
    ? createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        aria-label="Payees"
        className={`payee-menu${placement.above ? " payee-menu-above" : ""}`}
        // Keep focus in the input, so a press on an option, a heading or the
        // scrollbar does not blur it and close the list.
        onMouseDown={(event) => event.preventDefault()}
        // A pointer passing over the list must not leave a choice for Enter.
        onMouseLeave={() => setActive(-1)}
        style={{
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          ...(placement.above ? { bottom: window.innerHeight - placement.top } : { top: placement.top }),
        }}
      >
        {sections.transfers.length > 0 && (
          <div role="group" aria-labelledby={`${listId}-transfers`}>
            <div className="payee-menu-heading" id={`${listId}-transfers`} role="presentation">Transfers</div>
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
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && options[active] ? optionId(active) : undefined}
        value={value}
        autoComplete="off"
        placeholder="Payee"
        disabled={disabled}
        required={required}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onClick={() => {
          if (showing) {
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
            // Enter and Escape belong to the input method, not the row.
            if (event.key === "Enter" || event.key === "Escape") event.stopPropagation();
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!visible) {
              openMenu();
              return;
            }
            keyboardMove.current = true;
            const last = options.length - 1;
            setActive((current) => event.key === "ArrowDown"
              ? (current >= last ? 0 : current + 1)
              : (current <= 0 ? last : current - 1));
            return;
          }
          if (event.key === "Enter" && visible && options[active]) {
            // Pick the highlighted entry; the row saves on the next Enter.
            event.preventDefault();
            event.stopPropagation();
            choose(options[active]);
            return;
          }
          if (event.key === "Enter") {
            // Keep the typed text and let the row save; the list should not
            // stay over a validation message.
            setOpen(false);
            return;
          }
          if (event.key === "Escape" && visible) {
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
