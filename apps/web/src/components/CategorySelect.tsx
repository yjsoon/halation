import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "../api/client";
import { isQuietGroupName, splitCategoryGroups } from "../lib/categories";
import { usePlan } from "../state/plan";

/** Not a category id: the server's ids never start with a space. */
const NEW_CATEGORY = " new-category";
const NEW_GROUP = " new-group";

export function CategorySelect({
  value,
  onChange,
  groups,
  allowEmpty = true,
  emptyLabel = "Uncategorised",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  groups: ReturnType<typeof splitCategoryGroups>;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <select
        value={value}
        onChange={(event) => {
          if (event.target.value === NEW_CATEGORY) setCreating(true);
          else onChange(event.target.value);
        }}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {[...groups.primary, ...groups.quiet].map((group) => (
          <optgroup key={group.id} label={group.name}>
            {group.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={NEW_CATEGORY}>+ New category…</option>
      </select>
      {creating && (
        <NewCategoryDialog
          onClose={() => setCreating(false)}
          onCreated={(categoryId) => {
            setCreating(false);
            onChange(categoryId);
          }}
        />
      )}
    </>
  );
}

function NewCategoryDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (categoryId: string) => void }) {
  const { categoryGroups, createCategory } = usePlan();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Every live group, everyday ones first; an empty group still takes a category.
  const choices = categoryGroups
    .filter((group) => !group.deleted)
    .sort((first, second) => Number(Boolean(first.hidden) || isQuietGroupName(first.name))
      - Number(Boolean(second.hidden) || isQuietGroupName(second.name)));
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(choices[0]?.id ?? NEW_GROUP);
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newGroup = groupId === NEW_GROUP;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const trimmedGroup = groupName.trim();
    if (!trimmed || (newGroup && !trimmedGroup) || saving) return;
    const existing = (choices.find((group) => group.id === groupId)?.categories ?? [])
      .find((category) => !category.deleted && category.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (existing) {
      // Pick the one that is already there rather than make a twin.
      onCreated(existing.id);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const category = await createCategory(trimmed, newGroup ? { name: trimmedGroup } : { id: groupId });
      onCreated(category.id);
    } catch (cause) {
      setSaving(false);
      setError(cause instanceof ApiError && cause.code === "ynab_mirror_plan"
        ? "This plan mirrors YNAB, so its categories can only be changed in YNAB."
        : `Could not create the category. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  // Rendered at the body so it never sits inside a table row or another form,
  // and React events stop here so the row or form underneath does not see them.
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return createPortal(
    <dialog
      ref={dialogRef}
      className="account-organiser card-terms-dialog new-category-dialog"
      aria-labelledby="new-category-title"
      onClose={onClose}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !saving) dialogRef.current?.close();
      }}
      onKeyDown={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
      onChange={stop}
      onSubmit={stop}
    >
      <form className="card-terms-form" onSubmit={(event) => void submit(event)}>
        <header className="account-organiser-header">
          <div>
            <span className="page-eyebrow">Categories</span>
            <h2 id="new-category-title">New category</h2>
          </div>
        </header>
        <div className="account-organiser-content new-category-fields">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, Pets"
              maxLength={100}
              autoComplete="off"
              autoFocus
              required
              disabled={saving}
            />
          </label>
          <label className="field">
            <span className="field-label">Group</span>
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={saving}>
              {choices.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              <option value={NEW_GROUP}>New group…</option>
            </select>
          </label>
          {newGroup && (
            <label className="field">
              <span className="field-label">Group name</span>
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="For example, Household"
                maxLength={100}
                autoComplete="off"
                required
                disabled={saving}
              />
            </label>
          )}
          {error && <p className="transaction-editor-error" role="alert">{error}</p>}
        </div>
        <footer className="account-organiser-footer card-terms-footer">
          <button type="button" className="text-button" onClick={() => dialogRef.current?.close()} disabled={saving}>Cancel</button>
          <button type="submit" className="save-button" disabled={saving || !name.trim() || (newGroup && !groupName.trim())}>
            {saving ? "Creating…" : "Create category"}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
