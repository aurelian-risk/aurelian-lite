// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The calibration: every number the quantification runs on, in one place.
//
// These are settings, not measurements. Each table carries the question it answers, what
// changes when it moves, its source and how much it actually rests on (see TableDoc).
// The set is inspectable, editable and resettable from the Quantification workshop, and
// it is stored on the study - so it is exported, imported and shared with it, and two
// studies can hold different parameterisations.
//
// Two sides, kept apart on purpose (see docs/frequency-model.md and
// docs/resistance-model.md): how OFTEN a scenario is attempted, and what an attempt is
// UP AGAINST. Coupling them would make every frequency figure depend on how finely the
// kill chain was modelled.

export const CALIBRATION_VERSION = 1;

/** Sectors the base rates distinguish. Kept short: a longer list would suggest a
 *  precision the underlying evidence does not have. */
/** Organisation size by headcount, in Eurostat's classes. The bundled base rates were
 *  derived for a medium organisation, so that is the unit factor and the default. */
export const SIZES = ["Small (10-49)", "Medium (50-249)", "Large (250-999)", "Very large (1000+)"] as const;
export const SIZE_DEFAULT = "Medium (50-249)";

export const SECTORS = [
  "Healthcare", "Public sector", "Energy & utilities", "Finance & insurance",
  "Manufacturing", "Transport & logistics", "Retail & consumer",
  "Technology & telecom", "Education & research", "Other / unspecified",
] as const;

/** What is specific about each sector, in one line. The first sentence is what the
 *  model does with it (an adjustment to the attack rate, or none); the rest is a short
 *  characterisation of where the loss usually sits, which the model does NOT read - it
 *  is there so the choice is made deliberately rather than by guessing. */
/** What is specific about each sector. The first sentence is what the model does with
 *  it - an adjustment to the attack rate, or none, and why none. The rest is context the
 *  model does NOT read, so the choice is made deliberately rather than by guessing. */
export const SECTOR_NOTES: Record<string, string> = {
  "Healthcare": "Criminal attack rates 15% above the cross-sector figure. Published breach costs are the highest of any sector, USD 7.42M against a 4.44M average. Availability of clinical systems usually carries the loss rather than confidentiality.",
  "Public sector": "Hacktivist rates doubled and state-actor rates tripled - the sector politically motivated actors go after most. Service continuity and public trust carry the loss; neither is well expressed as a single currency figure.",
  "Energy & utilities": "State-actor rates tripled. Operational technology extends the chain beyond IT, so entry often runs through an engineering workstation or a remote-maintenance link rather than office systems. Safety consequences are not captured by a monetary loss at all.",
  "Finance & insurance": "Criminal rates 10% above the cross-sector figure, insider rates 20% above. Published breach costs USD 5.56M against a 4.44M average. Fraud losses and regulatory penalties usually dominate, and neither is reduced by recovery.",
  "Manufacturing": "Criminal rates 10% above the cross-sector figure; published breach costs USD 5.00M against a 4.44M average. Production stoppage usually carries the loss. Leak-site tallies put this sector at about a quarter of all victims, but that reflects how many organisations it contains, not a higher risk per organisation.",
  "Transport & logistics": "No adjustment: no normalised incidence figure exists for this sector, which means no measured difference rather than no risk. Availability carries the loss, and the chain frequently enters through a third party - carrier, forwarder, port or terminal system - so model that stakeholder and what it grants access to.",
  "Retail & consumer": "No adjustment: no normalised incidence figure exists for this sector. Payment and customer data drive the loss. Exposure is strongly seasonal, which the model does not represent - it computes an annual average, so a scenario aimed at peak trading is understated.",
  "Technology & telecom": "State-actor rates doubled, largely for onward access to customers. A compromise here becomes somebody else's initial access, which belongs in their study as a supply-chain entry, not only in yours.",
  "Education & research": "No adjustment: no normalised incidence figure exists for this sector. Open networks and a large transient user population widen the entry surface. Research data rather than money is often the objective, which weakens the extortion assumption behind the loss tables.",
  "Other / unspecified": "No sector adjustment: the base rates are used as published. Set a sector if one fits - exceptions only ever apply to a named actor-and-sector pair.",
};

/** One row of the sector table: this actor class attacks this sector more (or less)
 *  than it attacks an average organisation. */
export interface SectorRow { actor: string; sector: string; factor: number }

/** The organisation's own incident record, where there is one. The base rate is the
 *  weakest load-bearing number in the calibration (two credible surveys differ by a
 *  factor of six), and the one figure that beats every published survey is what this
 *  organisation actually saw. An entry here replaces the bundled rate for that actor
 *  class - and the sector exception with it, because a record of this organisation is
 *  already a record of its sector. */
export interface OwnHistory {
  /** Years the record covers. Zero = no record, every actor keeps the bundled rate. */
  years: number;
  /** Organisations the record covers: 1 for your own, more for a group or a peer set
   *  whose incidents were pooled. Exposure is years × organisations. */
  organisations: number;
  /** Serious operations observed per actor class over the WHOLE record - the same unit
   *  as the base rate (operations, not phishing mails or scans). An actor class without
   *  an entry keeps the bundled rate; a zero is an observation and is read as one. */
  counts: Record<string, number>;
}

export interface FrequencyCalibration {
  /** Serious operations per year an actor of this class mounts against one
   *  organisation. THE one quantity that needs evidence - everything else is a ratio. */
  baseRate: Record<string, number>;
  baseRateDefault: number;
  /** What this organisation saw itself. See `OwnHistory`; read by `ownRateOf`. */
  history: OwnHistory;
  /** Sector exceptions, as editable rows. Absent pairing = no adjustment. */
  sector: SectorRow[];
  /** Multiplier on the base rate by the study's size class. Medium = 1: the bundled
   *  rates were derived for it. Not applied to an own record - that is already a record
   *  of an organisation of this size. */
  size: Record<string, number>;
  /** Is this particular actor more or less active than typical? By `activity` rating. */
  tempo: number[];
  /** A well-resourced actor runs more operations in parallel. By `resources` rating.
   *  Deliberately mild, and deliberately NOT skill - skill is capability, and it
   *  belongs to the success side. */
  throughput: number[];
  /** Why us. The strongest study-specific lever. */
  targetPull: {
    /** The chain ends at a business asset this actor declared an objective on. */
    declared: number;
    /** The actor has declared objectives and none of them match this chain. */
    noMatch: number;
    /** No objectives modelled - fall back to the `relevance` rating. */
    byRelevance: number[];
  };
  /** How often contact happens at all, from the entry step's technique. */
  reachability: Record<string, number>;
  reachabilityDefault: number;
  /** No scenario is attempted weekly. Caps the product against a runaway multiplier
   *  stack rather than against any single setting. */
  cap: number;
  /** Boundaries in loss events per year between the levels of the `likelihood` scale -
   *  one fewer than there are levels. The model no longer READS likelihood: a holistic
   *  rating used as one isolated input made the model echo back the conclusion the
   *  analyst had already reached. These anchors turn the relationship round - the model
   *  computes a loss-event frequency without it, maps that back onto the scale, and a
   *  disagreement of more than one level becomes a question worth asking of either the
   *  rating or the analysis. Kept finite so the table survives a JSON round trip. */
  likelihoodBands: number[];
}

export interface DemandCalibration {
  /** What it takes to get the first foothold, by entry technique. */
  entry: Record<string, number>;
  /** Fallback by the entry step's tactic, when the technique is not recognised. */
  entryByTactic: Record<string, number>;
  entryDefault: number;
  /** Tooling maturity per technique: 0 commodity | 0.5 practitioner | 1 bespoke.
   *  The chain takes the MAXIMUM - the hardest thing you must be able to do is what
   *  gates you, and a maximum is unchanged when a step is split in two. */
  tooling: Record<string, number>;
  /** Fallback by tactic. An unrecognised technique with no tactic either contributes
   *  NOTHING rather than a guess - the `step-no-tactic` check is what asks for it. */
  toolingByTactic: Record<string, number>;
  /** Subtracted from the entry cost where a stakeholder grants access to the entry
   *  asset: that access was given, not taken. */
  grantedAccess: number;
  wTooling: number;
  wDepth: number;
  wDwell: number;
  /** Number of DISTINCT tactics at which the depth contribution is full. Distinct,
   *  not counted: describing the same attack in more steps must not make it harder. */
  depthSaturates: number;
  /** Tactics that mean staying inside a live environment without being thrown out. */
  dwellTactics: string[];
  /** Two dwell tactics is already a full contribution. */
  dwellSaturates: number;
  /** No chain is entirely free: even a trivial attack can be walked into. */
  floor: number;
  /** Spread either side of the derived demand. Wide on purpose: we do not know a bar
   *  to two decimals, and pretending we do turns the model into a threshold detector
   *  instead of a dial. */
  spread: number;
  /** Used where a scenario models no chain at all, so there is nothing to derive
   *  from - the `difficulty` rating carries on. Also what a manual override maps
   *  through, which is why it stays. */
  difficultyFallback: number[];
}

/** A three-point estimate as the calibration stores it. */
export interface Band { min: number; mode: number; max: number; lambda?: number; dist?: "pert" | "lognormal" }

export interface MagnitudeCalibration {
  /** Direct loss per event, by feared-event severity. Currency. */
  loss: Band[];
  /** Chance that a loss event drags a follow-on loss with it, by severity. */
  cascadeLikelihood: Band[];
  /** Size of that follow-on loss, by severity. Currency. */
  cascadeLoss: Band[];
}

export interface AdversaryCalibration {
  /** Threat capability as a share of the attacker population this actor out-performs,
   *  by `capability` rating. Each band is deliberately WIDE - a rating describes a
   *  class of actor, not an individual, and narrow bands would turn the comparison
   *  against the demand into an on/off switch.
   *
   *  Every band reaches close to 1 with a heavy mode (`lambda`): the mass stays around
   *  the rating, but the tail never quite closes. That tail is not decoration - the
   *  sampler has hard bounds, so a band stopping short of a bar would yield exactly
   *  zero vulnerability, and "this control can never be beaten" is never true. */
  capability: Band[];
}

export interface EffectCalibration {
  /** How far a step's own preventive coverage lifts the bar above the demand. */
  prevention: number;
  /** How much of a detective control converts into actually breaking off an intrusion. */
  /** RETIRED with the time race (docs/detection-time-race.md): kept in the shape so a
   *  stored calibration still reconciles; nothing reads it. */
  detection: number;
  /** Deterrence works on the decision to attack: fewer attempts are started. */
  deterrence: number;
  /** Avoidance removes the exposure, so contact happens less often. */
  avoidance: number;
  /** Share of a primary loss recovery can reach. Fines and reputation do not go away
   *  because the backups were good. */
  recoverableShare: number;
  /** How far containment cuts the chance of follow-on losses. */
  containment: number;
  /** Detecting the impact itself shortens the event rather than preventing it. */
  lateDetection: number;
  /** Detection is worth what the response makes of it; the floor grants that SOME
   *  reaction always happens, even where none was planned. */
  /** RETIRED with the time race; see `detection`. */
  responseFloor: number;
  /** A single control never fully blocks a step; layers stack towards this. */
  controlCeiling: number;
  /** A control only protects as far as it is actually in place. */
  statusWeight: Record<string, number>;
  /** What each implementation level is worth, as a share of a fully rolled-out
   *  control. Was implicit before - level divided by the top of the scale - which made
   *  the value of level 1 depend on how long the scale happened to be. Now explicit,
   *  and read like every other band, so a 1..N scale is placed proportionally. */
  levelWeight: number[];
  /** What a measure of each strength is worth against the ceiling, by the `strength`
   *  rating: weak / moderate / strong / very strong. The top is 1 - the ceiling itself,
   *  and what every measure was assumed to reach before the rating existed. */
  strengthWeight: number[];
  /** Years a one-off cost is spread over when a measure's worth is set against its cost. */
  costHorizonYears: number;
}

/** How fast the two sides are. Detection is a race (docs/detection-time-race.md): an
 *  attempt seen at a watched step is caught in time iff the defender's time to detect
 *  and act is shorter than the attacker's remaining time to the objective. Every entry
 *  is in DAYS, drawn per attempt; the bands are lognormal, points read P5/median/P95. */
export interface TimeCalibration {
  /** How long an attacker of typical capability spends on a step, by the step's tactic.
   *  A tactic without a row takes `stepDaysDefault`. */
  stepDays: Record<string, Band>;
  stepDaysDefault: Band;
  /** Multiplier on the attacker's time by capability, anchored at the rating levels and
   *  read at the attempt's own capability draw: the top of the population is fast. */
  capabilitySpeed: number[];
  /** Time from the attacker's action at a watched step to an alert somebody sees, by
   *  the detective measure's strength rating (weak … very strong). Whether the step is
   *  watched at all is the measure's efficacy; this is how fast, once it is. */
  detectDays: Band[];
  /** Time from the alert to containment, by the organisation's response readiness -
   *  a property of the study, not of a step. */
  respondDays: Record<string, Band>;
}

export interface Calibration {
  version: number;
  frequency: FrequencyCalibration;
  demand: DemandCalibration;
  adversary: AdversaryCalibration;
  effect: EffectCalibration;
  magnitude: MagnitudeCalibration;
  time: TimeCalibration;
}

/** The organisation's response readiness, on the study beside sector and size. */
export const READINESS = ["No response capability", "Plan on paper", "Exercised plan", "24x7 response with authority to contain"] as const;
export const READINESS_DEFAULT = "Plan on paper";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const FREQUENCY: FrequencyCalibration = {
  // Order of magnitude, per organisation per year, for an operation serious enough to
  // be worth modelling as a scenario - not for every probe that touches the perimeter.
  // Derived from published incidence surveys - see docs/calibration-sources.md. An
  // incidence p over twelve months implies a rate of lambda = -ln(1 - p), which is what
  // a "share of organisations that saw at least one" figure actually means.
  baseRate: {
    "Opportunist": 1.2,       // UK CSBS 2025: 67% medium / 74% large saw an attack -> 1.11-1.35
    "Cybercriminals": 0.35,   // ransomware: UK CSBS large 14% -> 0.15; Sophos 59% -> 0.89; geometric mean 0.37
    "Hacktivist": 0.05,
    "Insider": 0.08,          // DBIR internal-actor share applied to the criminal rate
    "Competitor": 0.03,
    "State actor": 0.02,
    "Terrorist": 0.01,
  },
  baseRateDefault: 0.2,
  history: { years: 0, organisations: 1, counts: {} },
  // Eurostat 2024 (EU-27, incidents with a consequence due to attack): 10-49 3.15%,
  // 50-249 4.34%, 250+ 7.05% - so 0.73 and 1.62 against medium, and IRIS 2025 puts the
  // step from $100M-1B to $1B-10B at 1.5 and the tiers above at 3-4. See sources §9.3.
  size: { "Small (10-49)": 0.73, "Medium (50-249)": 1.0, "Large (250-999)": 1.6, "Very large (1000+)": 2.5 },
  // MUCH flatter than raw victim counts suggest. Leak-site tallies put manufacturing far
  // above healthcare, but those are counts, and a sector with more organisations in it
  // produces more victims regardless of risk. Measured as incidence among comparable
  // organisations the gap nearly closes.
  // Two sources since 2026-09: Sophos ransomware incidence (§3) and IRIS 2025 relative
  // loss-event probability by sector (§9.4). Where they agree the row is confirmed;
  // where they disagree it sits halfway.
  sector: [
    { actor: "Cybercriminals", sector: "Healthcare", factor: 1.25 },
    { actor: "Cybercriminals", sector: "Finance & insurance", factor: 1.25 },
    { actor: "Cybercriminals", sector: "Manufacturing", factor: 1.05 },
    { actor: "Cybercriminals", sector: "Education & research", factor: 1.4 },
    { actor: "Cybercriminals", sector: "Technology & telecom", factor: 1.3 },
    { actor: "Cybercriminals", sector: "Energy & utilities", factor: 0.8 },
    // The exception: political targeting is consistently reported as concentrated, but
    // no normalised incidence figure exists for it. These stay judgement.
    { actor: "Hacktivist", sector: "Public sector", factor: 2.0 },
    { actor: "State actor", sector: "Public sector", factor: 3.0 },
    { actor: "State actor", sector: "Energy & utilities", factor: 3.0 },
    { actor: "State actor", sector: "Technology & telecom", factor: 2.0 },
    { actor: "Insider", sector: "Finance & insurance", factor: 1.2 },
    { actor: "Terrorist", sector: "Public sector", factor: 2.0 },
  ],
  tempo: [0.3, 0.7, 1.0, 1.6],
  throughput: [0.7, 0.9, 1.1, 1.4],
  targetPull: { declared: 1.6, noMatch: 0.5, byRelevance: [0.5, 0.8, 1.2, 1.6] },
  // Ordered by how often each vector is actually the way in. DBIR 2025 puts stolen
  // credentials first (22% of breaches), exploited vulnerabilities close behind (20%)
  // and phishing third (15%) - so credential abuse is NOT the rare route an earlier
  // setting made it, and was raised above phishing accordingly.
  reachability: {
    T1190: 1.5,   // Exploit Public-Facing Application - probed continuously
    T1133: 1.4,   // External Remote Services
    T1566: 1.3,   // Phishing - mail reaches everybody
    T1078: 1.2,   // Valid Accounts - identity surfaces are internet-facing and constantly tried
    T1195: 0.6,   // Supply Chain Compromise - rare, and not aimed at you specifically
  },
  reachabilityDefault: 1.0,
  cap: 12,
  likelihoodBands: [0.02, 0.1, 0.5],
};

const DEMAND: DemandCalibration = {
  entry: {
    T1078: 0.05,  // Valid Accounts - already legitimate
    T1566: 0.15,  // Phishing - commodity kit, but somebody has to act on it
    T1133: 0.15,  // External Remote Services
    T1190: 0.30,  // Exploit Public-Facing Application - needs a working exploit
    T1195: 0.45,  // Supply Chain Compromise - rare and bespoke
  },
  entryByTactic: { "Initial Access": 0.20, "Reconnaissance": 0.05, "Resource Development": 0.10 },
  entryDefault: 0.20,
  tooling: {
    // Reconnaissance / Resource Development
    T1595: 0, T1592: 0, T1589: 0, T1583: 0, T1587: 1, T1608: 0.5,
    // Initial Access
    T1566: 0, T1190: 0.5, T1133: 0, T1078: 0, T1195: 1,
    // Execution / Persistence
    T1059: 0, T1204: 0, T1053: 0, T1547: 0, T1136: 0, T1505: 0.5,
    // Privilege Escalation / Defense Evasion
    T1068: 0.5, T1548: 0.5, T1070: 0.5, T1027: 0.5, T1562: 0.5, T1055: 0.5,
    // Credential Access
    T1003: 0.5, T1110: 0, T1552: 0, T1555: 0.5,
    // Discovery
    T1087: 0, T1082: 0, T1046: 0, T1018: 0,
    // Lateral Movement
    T1021: 0.5, T1570: 0, T1550: 0.5,
    // Collection / Command and Control
    T1560: 0, T1005: 0, T1114: 0, T1071: 0, T1105: 0, T1573: 0,
    // Exfiltration / Impact
    T1041: 0, T1567: 0, T1048: 0,
    T1486: 0.5, T1490: 0.5, T1489: 0, T1485: 0, T1498: 0,
  },
  toolingByTactic: {
    "Reconnaissance": 0, "Resource Development": 0.5, "Initial Access": 0.25,
    "Execution": 0, "Persistence": 0.25, "Privilege Escalation": 0.5,
    "Defense Evasion": 0.5, "Credential Access": 0.5, "Discovery": 0,
    "Lateral Movement": 0.5, "Collection": 0, "Command and Control": 0.25,
    "Exfiltration": 0, "Impact": 0.25,
  },
  grantedAccess: 0.05,
  wTooling: 0.15,
  wDepth: 0.20,
  wDwell: 0.12,
  depthSaturates: 6,
  dwellTactics: ["Persistence", "Defense Evasion", "Lateral Movement"],
  dwellSaturates: 2,
  floor: 0.02,
  spread: 0.25,
  difficultyFallback: [0.20, 0.30, 0.40, 0.50],
};

const ADVERSARY: AdversaryCalibration = {
  capability: [
    { min: 0.01, mode: 0.12, max: 0.90, lambda: 7 },
    { min: 0.05, mode: 0.32, max: 0.93, lambda: 5 },
    { min: 0.15, mode: 0.58, max: 0.96, lambda: 4 },
    { min: 0.35, mode: 0.82, max: 0.99, lambda: 4 },
  ],
};

const MAGNITUDE: MagnitudeCalibration = {
  // Lognormal since 2026-09: the points are P5 / median / P95. Medians follow the typical
  // losses IRIS 2025 and NetDiligence 2025 report by revenue tier and sector; the P95s
  // follow their 95th percentiles - a ratio of 10-70 between median and P95, which is
  // what measured loss distributions look like and what a bounded band could not say.
  // The top band's mean is now ~8M against IBM's 4.44M mean. Sources §9.5.
  // Each band is symmetric on the log scale (min = median² / max), so the two outer
  // points ARE the 5th and 95th percentiles of the one sigma the band gets - an
  // asymmetric band would put sigma between its two sides and neither point exactly.
  loss: [
    { min: 2.7e3, mode: 2e4, max: 1.5e5, dist: "lognormal" },
    { min: 2e4, mode: 2e5, max: 2e6, dist: "lognormal" },
    { min: 4.5e4, mode: 6e5, max: 8e6, dist: "lognormal" },     // IRIS median 603K, healthcare 557K; NetDiligence healthcare SME 566K
    { min: 1.56e5, mode: 2.5e6, max: 4e7, dist: "lognormal" },  // IRIS $1B-10B typical 2M / extreme 62M; 2024 median 2.9M; 95th 32M
  ],
  cascadeLikelihood: [
    { min: 0.10, mode: 0.20, max: 0.35 },
    { min: 0.20, mode: 0.35, max: 0.55 },
    { min: 0.30, mode: 0.50, max: 0.70 },
    { min: 0.45, mode: 0.65, max: 0.85 },
  ],
  cascadeLoss: [
    { min: 1.25e3, mode: 1e4, max: 8e4, dist: "lognormal" },
    { min: 1.25e4, mode: 1e5, max: 8e5, dist: "lognormal" },
    { min: 6.25e4, mode: 5e5, max: 4e6, dist: "lognormal" },
    { min: 3.13e5, mode: 2.5e6, max: 2e7, dist: "lognormal" },
  ],
};

const EFFECT: EffectCalibration = {
  prevention: 0.40,
  detection: 0.35,
  deterrence: 0.35,
  avoidance: 0.60,
  recoverableShare: 0.60,
  containment: 0.50,
  lateDetection: 0.25,
  responseFloor: 0.20,
  controlCeiling: 0.85,
  statusWeight: { Implemented: 1, Planned: 0.5, Recommended: 0.15, Missing: 0 },
  // Matches the scale's own labels: level 1 is "none", so it is worth nothing. It used
  // to be 0.25 - an artefact of dividing the level by the top of the scale - which made
  // a measure whose implementation is explicitly "none" block a fifth of its step.
  levelWeight: [0, 1 / 3, 2 / 3, 1],
  // Against the ceiling. Very strong = the MFA-class control the ceiling was set from;
  // weak = a control whose published effect is small (awareness training on its own,
  // an inventory). The spacing is judgement; the assignments in the library are not.
  strengthWeight: [0.4, 0.65, 0.85, 1],
  costHorizonYears: 3,
};

const LN = (min: number, mode: number, max: number): Band => ({ min, mode, max, dist: "lognormal" });
const TIME: TimeCalibration = {
  // Days per step, by tactic. M-Trends 2026: median dwell 14 days over all intrusions,
  // 9 when found internally, 25 when told from outside; hand-off from initial access to
  // the operating group in 22 seconds; espionage 122 days. Ransomware operations run
  // their chain in days. These apportion a ransomware dwell of a week or two over the
  // tactics a chain typically walks - the sources give dwell per intrusion, not per
  // tactic, so the apportioning is the stated assumption. Sources §11.
  stepDays: {
    "Reconnaissance": LN(0.5, 3, 20),
    "Resource Development": LN(0.5, 3, 20),
    "Initial Access": LN(0.02, 0.5, 5),        // the mail is opened or it is not; hand-off in seconds
    "Execution": LN(0.01, 0.2, 2),
    "Persistence": LN(0.05, 0.5, 5),
    "Privilege Escalation": LN(0.1, 1, 7),
    "Defense Evasion": LN(0.05, 0.5, 5),
    "Credential Access": LN(0.1, 1, 7),
    "Discovery": LN(0.1, 1, 7),
    "Lateral Movement": LN(0.2, 2, 14),
    "Collection": LN(0.2, 2, 14),
    "Command and Control": LN(0.05, 0.5, 5),
    "Exfiltration": LN(0.2, 2, 14),
    "Impact": LN(0.05, 0.5, 3),                // encryption is hours, not days
  },
  stepDaysDefault: LN(0.1, 1, 7),
  // By capability, read at the attempt's own draw: a top-tier operator moves at a third
  // of the typical pace, an opportunist at twice it. Judgement, anchored on the
  // hand-off figure (seconds) against the median dwell (weeks).
  capabilitySpeed: [2.0, 1.3, 0.8, 0.35],
  // By the detective measure's strength: weak (a log nobody reads until asked) to very
  // strong (telemetry with alerting). Anchored so a moderate SIEM lands near the
  // 9-day internal-detection dwell once the response time is added.
  detectDays: [LN(3, 20, 90), LN(0.2, 1.5, 10), LN(0.05, 0.4, 3), LN(0.01, 0.1, 1)],
  // By the organisation's readiness. External notification (25 days) against internal
  // detection (9) says what a response that has to be organised on the day costs;
  // Marsh/Cyentia put incident-response planning among the three controls with the
  // largest measured effect.
  respondDays: {
    "No response capability": LN(5, 20, 90),
    "Plan on paper": LN(1, 4, 20),
    "Exercised plan": LN(0.2, 1, 5),
    "24x7 response with authority to contain": LN(0.02, 0.15, 1),
  },
};

export const DEFAULT_CALIBRATION: Calibration = {
  version: CALIBRATION_VERSION, frequency: FREQUENCY, demand: DEMAND,
  adversary: ADVERSARY, effect: EFFECT, magnitude: MAGNITUDE, time: TIME,
};

// ---------------------------------------------------------------------------
// What each table is for - shown next to it, so the number is never bare
// ---------------------------------------------------------------------------

/** How much the numbers in a table actually rest on. Shown next to each one, because
 *  "0.35 from a published incidence survey" and "0.35 because it felt right" are not the
 *  same claim, and a reader has no way to tell them apart otherwise. */
export type Evidence =
  /** The organisation's own record, entered by the analyst. Beats every published figure
   *  for THIS organisation; says nothing about any other. */
  | "own"
  /** Taken from published measurement, with the derivation written down. */
  | "measured"
  /** Computed from published measurement plus a stated assumption. */
  | "derived"
  /** Reasoned, not measured. No published figure answers this question. */
  | "judgement";

export interface TableDoc {
  title: string;
  grade: Evidence;
  /** Where the figure comes from, named specifically enough to check. */
  source?: string;
  /** What the numbers in this table answer, in one plain question. */
  question: string;
  /** What visibly changes in the results when the numbers are raised. */
  effect: string;
  /** Where the defaults came from, and what would justify replacing them. */
  origin: string;
}

export const CALIBRATION_DOC: Record<string, TableDoc> = {
  "frequency.baseRate": {
    title: "Base rate, per actor class",
    grade: "derived",
    source: "UK Cyber Security Breaches Survey 2025 (representative sample of all UK businesses); Sophos State of Ransomware 2024/2025 (organisations of 100-5,000 staff); Verizon DBIR 2025 actor split.",
    question: "How many attacks per year does an actor of this class start against one organisation? Whole operations, not individual phishing mails or scans.",
    effect: "Multiplies the attempt rate of every scenario driven by this actor class, and with it the expected annual loss.",
    origin: "Surveys report incidence - the share of organisations seeing at least one event in a year. A rate follows as -ln(1 - incidence). UK survey: 67% of medium and 74% of large businesses saw an attack, so 1.11-1.35/yr, which sets the opportunist rate; 14% saw ransomware, so 0.15/yr. Sophos, surveying organisations with an IT function: 59%, so 0.89/yr. The criminal rate is the geometric mean of those two. Replace this table with your own incident history if you have one.",
  },
  "frequency.history": {
    title: "Your own record",
    grade: "own",
    question: "What did this organisation actually see - how many serious operations per actor class, over how many years?",
    effect: "An actor class with an entry here takes its base rate from the record instead of the bundled table, and the sector exception no longer applies to it: a record of this organisation is already a record of its sector. Every scenario driven by that class follows.",
    origin: "Rate = (count + ½) ÷ (years × organisations). The half is the Jeffreys prior for a Poisson rate: it keeps a short record honest - zero events in three years reads as one in six, not as never - and vanishes against a long one. The same caveat as every survey: a record counts what was noticed. Leave the years at zero to use the bundled rates.",
  },
  "frequency.size": {
    title: "Organisation size",
    grade: "measured",
    source: "Eurostat isoc_cisce_ic 2024 (EU-27, enterprises >= 10 persons): incidents with a consequence due to attack in 3.15% of 10-49, 4.34% of 50-249 and 7.05% of 250+ enterprises. Cyentia IRIS 2025: relative probability of a loss event by revenue tier, 0.60x (<$10M) to 3.46x (>$100B).",
    question: "How much more often is an organisation of this size attacked than the medium one the bundled rates describe?",
    effect: "Multiplies the base rate of every actor class, and with it every attempt rate in the study. Read from the study's size; unset means medium. Not applied where the base rate comes from your own record.",
    origin: "The bundled base rates were derived from a survey's medium and large businesses, so medium is 1. Small is Eurostat's 3.15/4.34 = 0.73 (the any-incident column gives 0.71); large 7.05/4.34 = 1.62, with IRIS's step from $100M-1B to $1B-10B at 1.5; very large 2.5, below IRIS's 3-4 because its population is firms with a PUBLIC incident, which over-represents the largest. Two independent sources within 10% on the first three steps - the best agreement in this calibration; the fourth is derived.",
  },
  "frequency.sector": {
    title: "Sector exceptions",
    grade: "measured",
    source: "Sophos State of Ransomware sector reports - healthcare 67% and financial services 65% hit, against a 59% cross-sector figure; Cyentia IRIS 2025 relative loss-event probability by sector (healthcare 1.34x, financial 1.44x, manufacturing 1.03x, education 1.60x, information 1.55x, utilities 0.62x); ransomware leak-site tallies for 2025.",
    question: "Which actor classes attack a sector more than they attack an average organisation, and by what factor?",
    effect: "Multiplies the base rate for that one actor-and-sector pair. A factor of 1.15 means 15% more attacks. An absent pair means no adjustment.",
    origin: "Measured as incidence among comparable organisations: healthcare 67% against a 59% cross-sector figure, so x1.15. Victim counts suggest far larger differences but have no denominator - a sector with more organisations in it produces more victims at equal risk. The state-actor and hacktivist rows have no such measurement and remain judgement. Since 2026-09 a second source: where IRIS agrees with Sophos the row is confirmed, where it disagrees the row sits halfway (healthcare 1.15 and 1.34 -> 1.25); education, technology and energy rows are new from IRIS alone, damped towards 1 because IRIS pools every actor and carries a size effect.",
  },
  "frequency.tempo": {
    title: "Tempo, per activity rating",
    grade: "judgement",
    question: "Is this actor busier or quieter than typical for its class?",
    effect: "Multiplies the attempt rate. Read from the risk source's activity rating.",
    origin: "No published figure answers this. Centred on 1 in the middle of the scale, so a typical actor is not adjusted.",
  },
  "frequency.throughput": {
    title: "Throughput, per resources rating",
    grade: "judgement",
    question: "How many operations can this actor run at the same time?",
    effect: "Multiplies the attempt rate, weakly. Read from the resources rating.",
    origin: "No published figure answers this; kept narrow for that reason. Not skill - skill is the capability rating and works against the bar instead.",
  },
  "frequency.targetPull": {
    title: "Target pull",
    grade: "judgement",
    question: "Does the chain end at a business asset this actor has declared an objective on?",
    effect: "Multiplies the attempt rate; the strongest study-specific term. Three cases: an objective matches, objectives exist but none match, or none are modelled and the relevance rating stands in.",
    origin: "No dataset records which victims an actor had an interest in beforehand. The range is held to about a factor of three.",
  },
  "frequency.reachability": {
    title: "Reachability, per entry technique",
    grade: "derived",
    source: "Verizon DBIR 2025 initial-access vectors: stolen credentials 22% of breaches, exploited vulnerabilities 20%, phishing 15%.",
    question: "How easily does contact happen at all, given how this chain starts?",
    effect: "Multiplies the attempt rate. Read from the entry step's technique. Any technique can be given a row - from the bundled list or by its ATT&CK id - and a technique without one takes the default below.",
    origin: "Ordered by the observed initial-access vectors: stolen credentials 22% of breaches, exploited vulnerabilities 20%, phishing 15%. The order comes from that data; the spacing is judgement. The same technique also sets the entry cost - a different question, not the same effect counted twice.",
  },
  "frequency.likelihoodBands": {
    title: "Cross-check against the likelihood rating",
    grade: "judgement",
    question: "Where does one level of the likelihood scale end and the next begin, in loss events per year?",
    effect: "Changes nothing in the calculation. Sets when the tool reports that your rating and its own result disagree.",
    origin: "A convention about what counts as a disagreement worth raising, not a measurement.",
  },
  "demand.entry": {
    title: "Entry cost, per technique",
    grade: "derived",
    source: "Verizon DBIR 2025 initial-access vectors; Mandiant M-Trends 2026 on the industrialised access-broker market.",
    question: "How much attacker skill does the first foothold take, as a share of the attacker population?",
    effect: "Sets the starting height of the bar, and it is added into every gate along the chain - so it makes the whole scenario harder, not just its first step. Any technique can be given a row; one without takes the default.",
    origin: "The order follows the observed vectors: valid accounts and phishing are cheap and common, supply-chain compromise expensive and rare. The spacing is judgement. Where a stakeholder grants access to the entry step's asset, the granted-access discount is subtracted.",
  },
  "demand.tooling": {
    title: "Tooling maturity, per technique",
    grade: "judgement",
    question: "Tools anyone can download (0), practitioner work (0.5), or something built for the job (1)?",
    effect: "Raises the bar, weighted by the tooling weight. The chain takes its highest value: a maximum does not move when one step is described as two.",
    origin: "No dataset grades techniques by difficulty of execution, so this is judgement and editable. An unlisted technique falls back to its tactic; a step with neither contributes nothing.",
  },
  "demand.weights": {
    title: "Demand weights",
    grade: "judgement",
    question: "How much do tooling, breadth and dwell add on top of the entry cost?",
    effect: "bar = entry + tooling weight x tooling + breadth weight x breadth + dwell weight x dwell. Each weight is the most its term can add.",
    origin: "Chosen so the reference cases land where a practitioner would put them. Breadth counts distinct tactics and saturates, dwell is one step per tactic - both so that splitting a step changes nothing.",
  },
  "demand.difficultyFallback": {
    title: "Fallback, per difficulty rating",
    grade: "judgement",
    question: "What bar applies to a scenario that models no kill chain?",
    effect: "Replaces the derived bar for those scenarios, read from the difficulty rating.",
    origin: "The behaviour from before the bar was derived. A scenario with a modelled chain never uses this table.",
  },
  "adversary.capability": {
    title: "Attacker capability, per rating",
    grade: "judgement",
    question: "What share of all attackers does an actor of this class out-perform? 0.6 means better than 60% of the field.",
    effect: "Compared against the bar once per attempt. Vulnerability follows from the two distributions meeting - it is not set anywhere.",
    origin: "No published distribution of attacker skill exists. The bands are wide because a rating covers a class, not one person, and each reaches close to 1: a band stopping short of a bar would make that bar unbeatable.",
  },
  "time.step": {
    title: "How long the attacker spends on a step",
    grade: "derived",
    source: "Mandiant M-Trends 2026 (2025 data): median dwell 14 days over all intrusions, 9 days when detected internally, 25 when notified from outside; hand-off from initial access to the operating group in 22 seconds (8 hours in 2022); espionage 122 days. Ransomware operations complete their chain within days of access.",
    question: "How many days does an attacker of typical capability need for a step of this tactic?",
    effect: "Summed along the route ahead of a watched step, this is the time the defender has to detect and act. Longer steps give detection more room; a faster actor (capability) shortens every step.",
    origin: "The sources give dwell per intrusion, not per tactic; these bands apportion a ransomware dwell of one to two weeks over the tactics a chain walks, with initial access and impact in hours (the mail is opened or not; encryption runs in hours) and lateral movement, collection and exfiltration in days. Lognormal, points P5 / median / P95. The apportioning is the stated assumption; the totals are the measurement.",
  },
  "time.detect": {
    title: "How fast a watched step raises an alert",
    grade: "judgement",
    source: "Anchored: M-Trends 2026 internal-detection dwell of 9 days; alerting telemetry raises within hours.",
    question: "Once a detective measure of this strength sees the attacker, how long until somebody has an alert?",
    effect: "Adds to the defender's time in the race at every watched step. Whether the step is watched at all is the measure's efficacy (strength, roll-out, lifecycle); this is only how fast, once it is.",
    origin: "Weak: a log that is read when somebody asks - weeks. Moderate: a SIEM with rules somebody reviews - days; with the response time of a plan on paper this lands at the 9-day internal-detection dwell. Strong: tuned detections - a day. Very strong: telemetry with alerting - hours. The steps are judgement; the moderate anchor is the measurement.",
  },
  "time.respond": {
    title: "How fast the organisation acts on an alert",
    grade: "derived",
    source: "M-Trends 2026: 25 days dwell when notified from outside against 9 when detected internally; Marsh McLennan / Cyentia 2023: incident-response planning among the three controls with the largest measured effect on event likelihood.",
    question: "From the alert to containment - how long does this organisation take?",
    effect: "Adds to the defender's time at every watched step of every scenario. A property of the study (its response readiness), not of a step; the strongest lever a detective posture has, and now a factor the tornado shows.",
    origin: "No capability: the response has to be organised on the day - weeks, the external-notification dwell. Plan on paper: days. Exercised plan: a day or two. 24x7 with authority to contain: hours. Unset reads as a plan on paper, and the derivation says so.",
  },
  "time.speed": {
    title: "How much faster a capable attacker is",
    grade: "judgement",
    source: "M-Trends 2026: hand-off in 22 seconds where it took 8 hours in 2022 - the operating groups are fast; espionage dwell of 122 days - the patient ones are slow by choice.",
    question: "How does the attacker's capability change the time the steps take?",
    effect: "Multiplies every step's time at the attempt's own capability draw. A capable actor gives the defender less time; an opportunist more.",
    origin: "Read at the drawn capability, top of the population fast: x0.35 at the top, x2 at the bottom. Judgement; the direction is the measurement, the size is not.",
  },
  "effect.cost": {
    title: "What a measure costs against what it buys",
    grade: "judgement",
    question: "Over how many years is a one-off cost spread when a measure's yearly worth is set against it?",
    effect: "Only the ranking of measures by loss avoided per euro reads it. A longer period makes a one-off investment look cheaper per year; nothing else in the model moves.",
    origin: "Three years is a common write-off period for security tooling and projects; it is a convention, and an organisation with its own depreciation rule should set that instead.",
  },
  "effect.strength": {
    title: "What a measure's strength is worth",
    grade: "derived",
    source: "Google (MFA blocks 66% of targeted attacks, 99% of bulk phishing); Marsh McLennan / Cyentia 2023 (patching high-severity CVEs within 7 days halves the probability of an event; automated hardening the largest effect of any control; MFA only when implemented fully; incident-response planning, MFA and EDR the top three); Mandiant M-Trends 2026 (30% of ransomware intrusions found by internal detection); ASD Essential Eight (application control and patching as the first mitigations).",
    question: "When two measures are fully in force, how much does the stronger one protect against the weaker?",
    effect: "Multiplies a measure's efficacy before the roll-out and lifecycle weights. Read from the measure's Strength rating; the library seeds the rating from published evidence, an unrated measure counts as very strong - what every measure was assumed to be before the rating existed.",
    origin: "The ceiling (0.85) was set from MFA against targeted attacks, so a measure at the top of this scale is an MFA-class control and the rating says how far below that a measure sits. Weak 0.4: controls whose published effect on the likelihood of an event is small or indirect - awareness training alone, an asset inventory. Moderate 0.65: controls that narrow the attack surface or detect part of the activity - SIEM (30% of intrusions found internally), DLP, encryption. Strong 0.85: segmentation, EDR, patching within days, allow-listing on servers. Very strong 1: MFA, application control on endpoints, immutable backups. The steps are judgement; which measure gets which step is the library's table in calibration-sources.md.",
  },
  "effect": {
    title: "What each kind of measure is worth",
    grade: "measured",
    source: "Google security research on MFA: blocks 100% of automated attacks, 99% of bulk phishing and 66% of TARGETED attacks. Mandiant M-Trends 2026 detection sources for ransomware: 30% found internally, 49% announced by the attacker, 21% reported from outside.",
    question: "How far does each class of measure move the factor it acts on, when fully implemented?",
    effect: "Preventive raises the bar at its step. Detective makes the step watched; whether the intrusion is caught in time is the race in the time tables. Deterrent and avoidance cut the number of attacks. Corrective cuts the loss and the follow-on loss.",
    origin: "MFA blocks 66% of targeted attacks, against 99% of bulk phishing and 100% of automated ones. Targeted is the case a modelled scenario describes, which is why the ceiling is 0.85 and one measure comes out worth a factor of 2-4. For ransomware, 30% of intrusions are found by internal detection and 49% by the attacker announcing themselves - hence 0.35 for detection and a 0.20 response floor.",
  },
  "effect.depth": {
    title: "Defence in depth",
    grade: "judgement",
    question: "What is one measure worth at each implementation level and lifecycle status, and what does a second or third measure on the same step add?",
    effect: "A measure is worth level weight x status weight x ceiling. Measures on one step combine as 1 - product(1 - each), so they saturate: the second adds much less than the first, the third little. The combined figure then raises the bar by the preventive weight - which is the term that decides how much any of this matters, since the whole range from no cover to full cover moves the bar by that one figure.",
    origin: "The saturating form assumes the measures fail independently. Correlated failure - a shared administrator, platform or bypass - is modelled only where a measure names what it fails with; a stack of similar controls that does not is flattered. Depth across the chain is the effect that carries: the traversal makes an attacker clear every defended step, which is where distributing measures beats stacking them.",
  },
  "magnitude": {
    title: "Loss magnitude, per severity",
    grade: "derived",
    source: "Cyentia IRIS 2025: median loss per incident USD 603K (2015-2024, 2024 dollars), 95th percentile 32M, mean 14M; by revenue tier typical 329K-2M, extreme 7M-62M; healthcare median 557K, 95th 14M. NetDiligence Cyber Claims Study 2025: SME average incident 264K, ransomware 631-663K, healthcare SME 566K. IBM Cost of a Data Breach 2025: global mean 4.44M.",
    question: "What does one loss event cost, how often does a follow-on loss occur, and what does that cost?",
    effect: "Sets the money. Frequency decides how often you pay, these tables decide how much. Read from the feared event's severity. The money points are the 5th percentile, the median and the 95th of a lognormal - not bounds: one draw in twenty falls outside them, and the long ones are the tail every measured loss distribution has.",
    origin: "Measured loss distributions are lognormal with a 95th percentile 20-50x the median (IRIS: 603K against 32M). A band bounded at its maximum cannot produce that tail, so the money factors are drawn lognormal, with the three points read as P5 / median / P95. The medians follow the typical losses by revenue tier and sector, the P95s their 95th percentiles; a single scenario is narrower than a whole population, so the spread within a band (sigma 1.2-1.7) sits below the population's (2-2.4). The bands are symmetric on the log scale, so the outer points are exactly the 5th and 95th percentiles; an edited band that is not gets one sigma fitted to both sides. The most organisation-specific numbers here: replace them with your own loss history rather than adjusting them.",
  },
};

// ---------------------------------------------------------------------------
// Merge - a stored calibration keeps its edits and picks up new default tables
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Fold a stored calibration onto the defaults. Stored values win; tables added by a
 *  later version appear with their defaults instead of going missing. Arrays are taken
 *  wholesale - a shortened band or an edited sector list is an edit, not a gap. */
export function reconcileCalibration(stored: unknown): Calibration {
  const fold = (base: unknown, over: unknown): unknown => {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (isObj(base)) {
      if (!isObj(over)) return base;
      const out: Record<string, unknown> = { ...base };
      for (const k of Object.keys(over)) out[k] = k in base ? fold(base[k], over[k]) : over[k];
      return out;
    }
    return over === undefined ? base : over;
  };
  if (!isObj(stored)) return DEFAULT_CALIBRATION;
  const merged = fold(DEFAULT_CALIBRATION, stored) as Calibration;
  return { ...merged, version: CALIBRATION_VERSION };
}

/** Has anything been changed away from the defaults? Drives the reset affordance. */
export function isDefaultCalibration(c: Calibration): boolean {
  const same = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a) || Array.isArray(b))
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
    if (isObj(a) && isObj(b)) {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
    }
    return a === b;
  };
  return same({ ...c, version: CALIBRATION_VERSION }, DEFAULT_CALIBRATION);
}

// ---------------------------------------------------------------------------
// Lookup helpers - shared by the model and by the views that explain it
// ---------------------------------------------------------------------------

/** Pull the technique identifier out of the free-text technique field. */
export const techniqueId = (v: unknown): string | null =>
  (typeof v === "string" ? v.match(/T\d{4}/)?.[0] ?? null : null);

/** Sample an anchored band at a ratio 0..1, so a scale of any length feeds in. */
export function sampleBand(anchors: number[], r: number): number {
  if (!anchors.length) return 1;
  if (anchors.length === 1) return anchors[0];
  const x = r < 0 ? 0 : r > 1 ? 1 : r;
  const p = x * (anchors.length - 1), i = Math.min(anchors.length - 2, Math.floor(p)), t = p - i;
  return anchors[i] + (anchors[i + 1] - anchors[i]) * t;
}

/** Base rate for an actor class in a sector, with the sector row applied. */
/** The rate this organisation's own record gives for an actor class, or null where the
 *  record says nothing about it. (count + ½) / exposure - see the table's `origin`. */
export function ownRateOf(c: FrequencyCalibration, actor: string): number | null {
  const h = c.history;
  if (!h || !(h.years > 0) || !(h.organisations > 0)) return null;
  const n = h.counts[actor];
  if (typeof n !== "number" || !(n >= 0)) return null;
  return (n + 0.5) / (h.years * h.organisations);
}

/** The size multiplier for a study: 1 for medium, for an unset size, and for a size this
 *  calibration has no row for. */
export const sizeFactorOf = (c: FrequencyCalibration, size: string | undefined): number =>
  (size && c.size?.[size]) || 1;

export function baseRateOf(c: FrequencyCalibration, actor: string, sector: string, size?: string): number {
  const own = ownRateOf(c, actor);
  if (own != null) return own;                        // the record already IS this sector and this size
  const base = c.baseRate[actor] ?? c.baseRateDefault;
  const row = c.sector.find((s) => s.actor === actor && s.sector === sector);
  return base * (row ? row.factor : 1) * sizeFactorOf(c, size);
}

/** Is this a sector the model has a vocabulary for? The lookup above matches by STRING,
 *  so a value from somewhere else - a hand-edited file, another product's export, a
 *  renamed list - simply finds no row and silently behaves like no sector at all. Asking
 *  the question here is what lets the views say so instead. The union of the bundled list
 *  and whatever a hand-edited calibration names, because either is a deliberate value. */
export function knownSector(c: FrequencyCalibration, sector: string): boolean {
  if (!sector) return true;                       // "not set" is a choice, not a mistake
  return (SECTORS as readonly string[]).includes(sector) || c.sector.some((r) => r.sector === sector);
}
