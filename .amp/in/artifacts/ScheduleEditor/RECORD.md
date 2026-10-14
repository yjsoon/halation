# ScheduleEditor run record

- Base: origin/main 2047fff plus the refreshAfterBulk commit (unrelated file). Change: `ScheduleEditor` is now a thin wrapper that keys `ScheduleEditorForm` by schedule id (or "create"), so the call site no longer carries the key and its comment.
- Fixture: disposable stack from `.amp/in/artifacts/run-fresh.sh` (synthetic `HowMuch Demo` seed). Schedules seeded through the local API: `SchedVerify A` (plain, -5.000) and `SchedVerify B` (split, two lines).
- Command: `.amp/in/artifacts/run-fresh.sh .amp/in/artifacts/ScheduleEditor/drive.cjs <out-dir>`
- Expected: open Edit on A, then Edit on B without closing: the form shows B (memo, split checked, two lines), never A's fields. Saving B changes only B. Add after Edit gives a blank form. Saving plain A keeps it unsplit. Unchecking split on B and saving removes its lines on the server.
- Observed:
  - `editA memo=SchedVerify A splitChecked=false`
  - `switchToB memo=SchedVerify B splitChecked=true splitLines=2`
  - `afterSaveB: A.memo=SchedVerify A A.amount=-5000 B.memo=SchedVerify B2 B.lines=2 B.amount=-3000`
  - `addAfterEdit heading=ADD SCHEDULED TRANSACTION memo=''`
  - `afterSaveA: A.memo=SchedVerify A2 A.lines=0`
  - `afterUnsplitB: B.lines=0 B.amount=-3000`
- Artifacts: `switch-to-b.png`, `final.png`, `payloads.json` (request bodies sent).
- Also run: `bun run --cwd apps/web typecheck` (clean), `bun test apps/web` (413 pass).
- Not covered: a before-change run of this driver; the remount behaviour is the same `key` mechanism moved one level down.
