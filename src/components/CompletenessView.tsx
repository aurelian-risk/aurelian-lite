// Quality-checks dashboard: runs the completeness linter and lists the gaps
// (failing checks first) with the affected entities as click-through chips and a
// fix hint; passing checks collapse into a compact green list.
import { useState } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle } from "../domain/taxonomy";
import { lintStudy, sortChecks, type Severity } from "../domain/lint";
import { EntityModal } from "./EntityModal";

const SEV_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

export function CompletenessView({ tax, study }: { tax: Taxonomy; study: Study }) {
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const checks = sortChecks(lintStudy(tax, study));
  const failing = checks.filter((c) => c.affected.length > 0);
  const passing = checks.filter((c) => c.affected.length === 0);
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const c of failing) counts[c.severity]++;
  const totalIssues = failing.reduce((n, c) => n + c.affected.length, 0);

  return (
    <div className="lint">
      <div className="lint-head">
        <h2>Quality checks</h2>
        <p className="hint">Completeness gaps in the analysis, with the affected items and how to close them. Everything here is derived from the study - fixing the data clears the check.</p>
        <div className="lint-summary">
          <span className={"lint-pill " + (totalIssues ? "warn" : "ok")}>{totalIssues ? `${totalIssues} open items` : "No gaps found"}</span>
          {counts.high > 0 && <span className="lint-pill sev-high">{counts.high} high</span>}
          {counts.medium > 0 && <span className="lint-pill sev-medium">{counts.medium} medium</span>}
          {counts.low > 0 && <span className="lint-pill sev-low">{counts.low} low</span>}
        </div>
      </div>

      <div className="lint-list">
        {failing.map((c) => (
          <div key={c.id} className={"lint-card sev-" + c.severity}>
            <div className="lint-card-h">
              <span className={"lint-sev sev-" + c.severity}>{SEV_LABEL[c.severity]}</span>
              <span className="lint-title">{c.title}</span>
              <span className="lint-count mono">{c.affected.length} / {c.total}</span>
            </div>
            <div className="lint-hint">{c.hint}</div>
            <div className="lint-chips">
              {c.affected.map((e) => {
                const t = getType(tax, e.type);
                return <button key={e.id} type="button" className="chip link" onClick={() => setRec(e)}>{t ? recordTitle(t, e) : e.type}</button>;
              })}
            </div>
          </div>
        ))}
      </div>

      {passing.length > 0 && (
        <div className="lint-passing">
          <div className="lint-sub">Passing checks ({passing.length})</div>
          <div className="lint-pass-grid">
            {passing.map((c) => <div key={c.id} className="lint-pass">✓ {c.title}</div>)}
          </div>
        </div>
      )}

      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}
