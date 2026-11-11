import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RewardsReport } from "../api/types";
import { exposure, type Exposure } from "../lib/reward-exposure";
import { projectRow, rowText, type RewardRowProjection } from "../lib/reward-row-projection";
import { ExposureFace } from "./ExposureFace";
import "../pages/rewards-board.css";

type Row = RewardsReport["cards"][number];

export interface MastheadScene {
  row: Row;
  projection: RewardRowProjection;
  picture: Exposure;
}

/**
 * The account's reward card, when it has a picture. One card only: two cards' words on one ground would
 * read as one scene for both (docs/frontend/rewards-exposure-card.md "Register masthead").
 */
export function mastheadScene(report: RewardsReport | null | undefined, accountId: string | undefined): MastheadScene | null {
  if (!report || !accountId) return null;
  const rows = report.cards.filter((row) => row.account_id === accountId);
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  const projection = projectRow(row, report.as_of, false);
  const picture = exposure(projection);
  return picture ? { row, projection, picture } : null;
}

const expectedKey = (planId: string) => `howmuch:register-mastheads:${planId}`;

/**
 * The accounts that had exactly one reward card when the cards were last loaded, or null before the first
 * load. Only a hint for whether to hold the masthead's shape while the cards load; the report decides.
 */
export function expectedMastheads(planId: string): string[] | null {
  try {
    const value = JSON.parse(localStorage.getItem(expectedKey(planId)) ?? "null");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : null;
  } catch {
    return null;
  }
}

export function rememberMastheads(planId: string, cards: readonly { ynabAccountId: string }[]): void {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.ynabAccountId, (counts.get(card.ynabAccountId) ?? 0) + 1);
  const ids = [...counts].filter(([, count]) => count === 1).map(([id]) => id);
  try { localStorage.setItem(expectedKey(planId), JSON.stringify(ids)); } catch { /* Holds every card account when storage is unavailable. */ }
}

/**
 * An account register's header on its reward card's sunrise: the title and balance in the sky, the card's
 * words on the ground, and the ground fading into the page above the filters. The title already names the
 * card, so the words carry no name unless the card's differs from the account's.
 */
export function RegisterMasthead({ scene, accountName, children }: {
  /** Null while the card's report loads: the header keeps the masthead's shape, with no sky or words yet. */
  scene: MastheadScene | null;
  accountName: string;
  /** The sky: the title and the balance. */
  children: ReactNode;
}) {
  if (!scene) {
    return (
      <div className="report-header register-header register-masthead" data-pending>
        <div className="rw-face" data-variant="strip">
          <div className="register-masthead-sky">{children}</div>
          {/* Holds the ground's usual two lines, so the words arrive without moving the register. Unseen
              glyphs, not spaces, so the lines are set in the words' own fonts. */}
          <div className="rw-strip-foot register-masthead-ground" aria-hidden="true">
            <p className="rw-headline"><b className="rw-amount">0</b><span className="rw-action">0</span></p>
            <p className="rw-basis">0</p>
          </div>
        </div>
      </div>
    );
  }
  const { row, projection: p, picture } = scene;
  const text = rowText(p);
  return (
    <div className="report-header register-header register-masthead rw-card" data-type={row.card.type} data-tone={p.tone}
      data-stage={picture.stage} data-mono={picture.stage === "failed" || undefined}>
      {/* No session memory: the sun sweeps quietly into place each time the header is shown. */}
      <ExposureFace exposure={picture} variant="strip" index={0} gentle>
        <div className="register-masthead-sky" data-rw="name">{children}</div>
        <Link to={`/rewards?accounts=${encodeURIComponent(row.account_id)}`} className="rw-strip-foot register-masthead-ground"
          data-rw="foot" aria-label={`Rewards, ${row.card.name}. ${text.accessibilityValue}`}>
          {row.card.name !== accountName && <p className="register-masthead-card">{row.card.name}</p>}
          <p className="rw-headline">
            {text.amount != null && <b className="rw-amount">{text.amount}</b>}
            <span className="rw-action">{text.actionLabel}</span>
            {text.deadline && <span className="rw-deadline" data-urgent={text.isUrgent || undefined}>{text.deadline}</span>}
          </p>
          <p className="rw-basis">{text.basisLine}</p>
          {text.exceptionLines.length > 0 && (
            <ul className="rw-exceptions">{text.exceptionLines.map((line) => <li key={line}>{line}</li>)}</ul>
          )}
        </Link>
      </ExposureFace>
    </div>
  );
}
