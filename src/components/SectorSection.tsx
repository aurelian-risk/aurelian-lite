// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The study's sector, in the workshop that defines the scope.
//
// It is a quantification input, not a label: it selects which base-rate exceptions
// apply to the attack rate of every scenario. Shown with the exceptions it actually
// triggers, so the choice reads as consequential rather than administrative.
import type { Study } from "../domain/types";
import { useStore } from "../domain/store";
import { DEFAULT_CALIBRATION, knownSector, SECTORS, SECTOR_NOTES } from "../domain/calibration";

export function SectorSection({ study, color }: { study: Study; color: string }) {
  const updateStudy = useStore((s) => s.updateStudy);
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const sector = study.sector ?? "";
  const rows = cal.frequency.sector.filter((r) => r.sector === sector);
  // A study can arrive carrying a sector this calibration has never heard of - imported
  // from elsewhere, or edited in the file. Leaving it out of the list would show the study
  // as having no sector while it still has one, and the first touch of the select would
  // overwrite it. It stays in the list, and says what it is worth: nothing.
  const known = knownSector(cal.frequency, sector);

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Sector</h3>
        <span className="spacer" />
        <span className="hint">selects the attack-rate exceptions applied to this study</span>
        <select className="btn sm" value={sector}
          onChange={(e) => updateStudy(study.id, { sector: e.target.value || undefined })}>
          <option value="">Not set</option>
          {!known && <option value={sector}>{sector} — not in this calibration</option>}
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="panel-body sect-body">
        {sector ? (
          <>
            <p className={"sect-note" + (known ? "" : " warn")}>
              {known ? SECTOR_NOTES[sector]
                : `The quantification matches a sector by name, and no rate exception is written for "${sector}". `
                  + "The published base rates are used unchanged - the same as no sector at all. "
                  + "Pick one from the list, or add the exception in Calibration."}
            </p>
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
