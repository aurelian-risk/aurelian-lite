// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The study's sector, in the workshop that defines the scope.
//
// It is a quantification input, not a label: it selects which base-rate exceptions
// apply to the attack rate of every scenario. Shown with the exceptions it actually
// triggers, so the choice reads as consequential rather than administrative.
import type { Study } from "../domain/types";
import { useStore } from "../domain/store";
import { DEFAULT_CALIBRATION, SECTORS, SECTOR_NOTES } from "../domain/calibration";

export function SectorSection({ study, color }: { study: Study; color: string }) {
  const updateStudy = useStore((s) => s.updateStudy);
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const sector = study.sector ?? "";
  const rows = cal.frequency.sector.filter((r) => r.sector === sector);

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Sector</h3>
        <span className="spacer" />
        <span className="hint">selects the attack-rate exceptions applied to this study</span>
        <select className="btn sm" value={sector}
          onChange={(e) => updateStudy(study.id, { sector: e.target.value || undefined })}>
          <option value="">Not set</option>
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="panel-body sect-body">
        {sector ? (
          <>
            <p className="sect-note">{SECTOR_NOTES[sector]}</p>
            <p className="sect-eff">
              <span className="sect-eff-k">Applied to the attack rate:</span>{" "}
              {rows.length
                ? rows.map((r) => `${r.actor} ×${r.factor}`).join(" · ")
                : "none"}
            </p>
          </>
        ) : (
          <p className="sect-note muted">
            Without a sector the quantification uses the published base rates unchanged.
            Choosing one only changes the attack rate where a documented exception exists.
          </p>
        )}
      </div>
    </div>
  );
}
