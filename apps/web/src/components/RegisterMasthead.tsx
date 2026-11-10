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

/**
 * An account register's header on its reward card's sunrise: the title and balance in the sky, the card's
 * words on the ground, and the ground fading into the page above the filters. The title already names the
 * card, so the words carry no name unless the card's differs from the account's.
 */
export function RegisterMasthead({ scene, planId, accountName, children }: {
  scene: MastheadScene;
  planId: string;
  accountName: string;
  /** The sky: the title and the balance. */
  children: ReactNode;
}) {
  const { row, projection: p, picture } = scene;
  const text = rowText(p);
  return (
    <div className="report-header register-header register-masthead rw-card" data-type={row.card.type} data-tone={p.tone}
      data-stage={picture.stage} data-mono={picture.stage === "failed" || undefined}>
      <ExposureFace exposure={picture} variant="strip" index={0} memoryKey={`${planId}|${row.card.id}|register`}>
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
