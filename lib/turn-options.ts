type OptionDraft = { options: ReadonlyArray<{ question: string; angle: string }> };
type VersionGuard = { journeyId: string; identityId: string; expectedVersion: number };

/** Builds atomic option inserts for both fixture and live turns. */
export function optionStatements(
  db: D1Database,
  turnId: string,
  setVersion: number,
  draft: OptionDraft,
  guard?: VersionGuard,
) {
  return draft.options.map((option, position) => {
    const statement = guard
      ? db.prepare(
          `INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state)
           SELECT ?, ?, ?, ?, ?, ?, 'proposed'
           WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
             AND version = ? AND deleted_at IS NULL)`,
        )
      : db.prepare(
          `INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state)
           VALUES (?, ?, ?, ?, ?, ?, 'proposed')`,
        );
    const values = [crypto.randomUUID(), turnId, setVersion, position, option.question, option.angle];
    return guard
      ? statement.bind(...values, guard.journeyId, guard.identityId, guard.expectedVersion)
      : statement.bind(...values);
  });
}
