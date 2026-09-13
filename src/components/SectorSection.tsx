// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The study's sector, in the workshop that defines the scope.
//
// It is a quantification input, not a label: it selects which base-rate exceptions
// apply to the attack rate of every scenario. Shown with the exceptions it actually
// triggers, so the choice reads as consequential rather than administrative.
import type { Study } from "../domain/types";
import { t as tr } from "../domain/i18n";
import { useStore } from "../domain/store";
import { DEFAULT_CALIBRATION, knownSector, READINESS, SECTORS, SECTOR_NOTES, SIZES, sizeFactorOf } from "../domain/calibration";

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
        <h3>{tr('ui.sectorsection.sector', 'Sector')}</h3>
        <span className="spacer" />
        <span className="hint">{tr("ui.sector.selects-the-exceptions", "selects the attack-rate exceptions applied to this study")}</span>
        <select className="btn sm sect-pick" value={sector}
          onChange={(e) => updateStudy(study.id, { sector: e.target.value || undefined })}>
          <option value="">{tr('ui.sectorsection.not-set', 'Not set')}</option>
          {!known && <option value={sector}>{sector} — not in this calibration</option>}
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Size beside sector: the two dimensions of the base rate, and the size is the
            stronger of the two in every source that has a denominator. */}
        <span className="hint" style={{ marginLeft: 10 }}>{tr("ui.sector.size", "size")}</span>
        <select className="btn sm size-pick" value={study.size ?? ""} title={tr("ui.sector.size-title", "Headcount class - multiplies the attack rate; unset means medium")}
          onChange={(e) => updateStudy(study.id, { size: e.target.value || undefined })}>
          <option value="">{tr("ui.sector.size-unset", "Medium (unset)")}</option>
          {SIZES.map((z) => <option key={z} value={z}>{z}{cal.frequency.size[z] && cal.frequency.size[z] !== 1 ? ` ×${cal.frequency.size[z]}` : ""}</option>)}
        </select>
        {/* Response readiness: the defender's side of the detection race, a fact about the
            organisation and not about any step - so it lives here with sector and size. */}
        <span className="hint" style={{ marginLeft: 10 }}>{tr("ui.sector.readiness", "response")}</span>
        <select className="btn sm readiness-pick" value={study.readiness ?? ""}
          title={tr("ui.sector.readiness-title", "How fast the organisation acts on an alert - the defender's side of the detection race; unset reads as a plan on paper")}
          onChange={(e) => updateStudy(study.id, { readiness: e.target.value || undefined })}>
          <option value="">{tr("ui.sector.readiness-unset", "Plan on paper (unset)")}</option>
          {READINESS.map((r) => <option key={r} value={r}>{r}</option>)}
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
              <span className="sect-eff-k">{tr('ui.sectorsection.applied-to-the-attack', 'Applied to the attack rate:')}</span>{" "}
              {rows.length
                ? rows.map((r) => `${r.actor} ×${r.factor}`).join(" · ")
                : "none"}
              {study.size && sizeFactorOf(cal.frequency, study.size) !== 1 && ` · ${tr("ui.sector.every-class", "every class")} ×${sizeFactorOf(cal.frequency, study.size)} (${study.size})`}
            </p>
          </>
        ) : (
          <p className="sect-note muted">
            {tr('ui.sectorsection.without-a-sector-the', 'Without a sector the quantification uses the published base rates unchanged.\n            Choosing one only changes the attack rate where a documented exception exists.')}
          </p>
        )}
      </div>
    </div>
  );
}
