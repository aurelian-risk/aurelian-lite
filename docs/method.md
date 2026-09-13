# How the quantification works

Aurelian Lite turns a qualitative risk analysis — actors, feared events, attack chains,
security measures — into money: an expected annual loss per scenario, with the
distribution behind it and the reasoning behind every number. This document describes the
method, what it rests on, and what it does not claim. It is written to be argued with.

Everything here runs offline in the browser from the study's own records. Nothing is
typed in as a probability; every figure is derived from the qualitative model, and every
derived figure can be overridden and traced back to the record it came from.

---

## 1. The model in one page

For each operational scenario — one attack chain against one asset — a year is simulated
many thousand times:

```
attempts  ~ Poisson( attempts per year )                       how often it is tried
per attempt:  one attacker capability is drawn, once
              the attacker walks the chain: every defended step is a gate he has to beat,
              every watched step a race he has to win — the LOSS EVENT is reaching the objective
per loss event:  loss ~ direct impact + (follow-on loss, sometimes)
annual loss = sum of the year's losses
```

Five mechanisms carry the whole method:

| Mechanism | What decides it | Where it comes from |
|---|---|---|
| **How often** an attempt is made | actor class × sector × organisation size, tempo, resources, why this organisation, how reachable the entry is | published incidence surveys; your own incident record where you have one |
| **What an attempt is up against** | the chain itself: the entry technique, the tooling the techniques need, how many tactics it spans, whether it has to stay inside | the kill chain the analyst modelled, read through ATT&CK technique ids |
| **What each measure does** | its effect class: prevent, detect, correct, deter, avoid — each acts on a different factor, none on all | the measure's class, strength, roll-out and lifecycle |
| **Whether the defender is in time** | a race at every watched step: alert + response against the attacker's remaining time to the objective | dwell-time measurements; the organisation's response readiness |
| **What a loss costs** | the feared event's severity, as a heavy-tailed distribution, less what recovery buys | published loss distributions by size and sector |

Everything is a range, not a point: a rating maps to a wide band, and the simulation draws
from it. The result is a distribution, and the reading is the *mean annual loss*, the bad
years (P90, P99), the exceedance curve, and — most useful — *where on the chain the
attempts died*.

---

## 2. How often a scenario is attempted

```
attempts / year = base rate × tempo × throughput × target pull × reachability      (capped)
```

**The base rate** is the one quantity that needs evidence; everything else is a ratio on
it. It is a serious operation per year against one organisation, by actor class
(opportunist 1.2, cybercriminals 0.35, insider 0.08, state actor 0.02 …), derived from
incidence surveys through the Poisson relation *λ = −ln(1 − share of organisations
affected)*. Two dimensions modify it:

- **Sector** — measured as incidence among comparable organisations, which is far flatter
  than victim counts suggest (healthcare ×1.25, finance ×1.25, manufacturing ×1.05 for
  criminal actors; political rows for state actors and hacktivists are judgement).
- **Organisation size** — every source with a denominator finds larger organisations hit
  more often, and more strongly than any sector effect: small ×0.73, medium ×1 (the unit
  the rates describe), large ×1.6, very large ×2.5.

**Your own record beats every survey.** Enter the serious operations you saw per actor
class over N years; the rate becomes *(count + ½) ÷ (years × organisations)* — the ½ is
the Jeffreys prior, so zero events in three years reads as one in six rather than never —
and replaces the bundled rate, sector and size for that class.

The multipliers read the actor's ratings (activity, resources), whether it declared an
objective on what the chain goes after, and how easily contact happens given the entry
technique (exposed applications and remote services are probed continuously; supply-chain
compromise is rare). They are kept narrow on purpose: no source measures them, and an
uncheckable term must not be able to move the answer far.

The analyst's own *likelihood* rating is **not** an input. It is compared with the
model's answer afterwards, as a cross-check — using a holistic rating as one isolated
input would make the model echo the conclusion the analyst had already reached.

## 3. What an attempt is up against

The attacker draws **one capability** per attempt — a rank among all attackers, from a
wide band by the actor's capability rating — and has to clear a **demand** that is
derived from the chain, not rated:

```
demand = getting in  +  tooling  +  breadth  +  staying in
```

*Getting in* is the entry technique's cost (valid accounts and phishing are cheap and
common, supply-chain compromise expensive and rare); *tooling* the hardest technique on
the chain (downloadable, practitioner, has to be built); *breadth* how many distinct
tactics the chain spans; *staying in* whether it needs persistence, evasion or lateral
movement. The property that shapes every term: **describing the same attack in more
detail must not change the answer** — a chain split into more steps is not harder, and a
step nothing defends costs the attacker nothing.

## 4. The chain is the calculation

The kill chain is walked per attempt in topological order, honouring each step's
prerequisites (*all* of them, or *any one* — a conjunction or an alternative route).

- **Only a defended step is a gate.** Its bar is the demand plus what the preventive
  measures on it add; the attacker passes iff his capability draw beats the bar's draw.
  Two gates on one route are better than one — both draws must come out low; two on a
  route he does not need are worth nothing.
- **A watched step is a race.** A detective measure decides whether the step is watched
  (its efficacy). If it is, the attempt is caught iff *time to alert + time to respond*
  is shorter than the attacker's remaining time to the objective by the fastest route —
  every step's duration by its tactic, faster for a capable actor; the alert time by the
  measure's strength (hours for alerting telemetry, days for a reviewed SIEM, weeks for a
  log read when asked); the response time by the **organisation's readiness** — no
  capability, plan on paper, exercised plan, 24×7 with authority to contain (weeks, days,
  a day, hours). An attempt that was *seen and still reached the objective* is counted
  and reported as such; it is the finding a per-step probability could not show.
- **Measures that fail together fail together.** A measure can name what it *fails
  with* — the identity provider, the SIEM, one administrator. Steps whose defence rests on
  the same cause are drawn with one random position per attempt: two gates on one cause
  are worth exactly one gate. Nothing is invented for this; the tie is the strongest
  correlation there is, because a shared dependency that fails is not a little weaker at
  each gate, it is gone at all of them.
- **The loss event is reaching the objective.** Initial compromise is not a loss event.
  This is what lets detection count: a chain broken at lateral movement never became a
  loss, so removing it from the frequency is not double counting.

The traversal knows *where* every attempt stopped — before any measure, at which gate, by
detection in time — and the **break-point distribution** is the most actionable output of
the method: it answers *where does my money work* better than any single figure.

## 5. What a measure does, and what it is worth

**A measure is defined, for quantification, by the mechanism it works through** — not by
how much effort it took. Five classes, each with its own channel into the model:

| Class | Anchored on | Moves |
|---|---|---|
| **Preventive** | the step it covers | the bar at that step — the attacker has to beat it |
| **Detective** | the step it covers | whether the step is *watched* — and then the race |
| **Corrective** | the asset it protects | the loss, and the chance of follow-on loss |
| **Deterrent** | the scenario | how many attempts are made at all |
| **Avoidance** | the asset it protects | how often contact happens at all |

One example from the bundled sample study: *offline immutable backups* are a corrective
control on the ransomware chain. A model that treats every measure as resistance makes
them reduce the chance of encryption — which is false. Backups do not make encryption
less likely; they make it cheaper. Here they cut the loss and the follow-on risk and
leave the probability of encryption where it was. Symmetrically, a deterrent belongs on
the number of attempts, not on the ability to withstand one. A measure without a class
is treated as preventive, and the completeness checks say so.

**None of the classes is second-rate.** A view that counts only what stops an attacker
at a step — the defence bars, the tactic heatmap — leaves the other classes out, and
that is easy to misread as "these do not count". They do, on another factor: corrective
measures on the loss, deterrent and avoidance on the number of attacks, detective on
whether the attempt is caught before the objective. All of them move the annual loss.

### What one measure protects

```
protection  =  strength  ×  roll-out  ×  lifecycle  ×  ceiling
```

| Term | Reads | Values |
|---|---|---|
| **Strength** | the measure's *Strength* rating | weak ×0.4 · moderate ×0.65 · strong ×0.85 · very strong ×1 |
| **Roll-out** | *Implementation level* | none ×0 · partial ×⅓ · substantial ×⅔ · full ×1 |
| **Lifecycle** | *Status* | implemented ×1 · planned ×0.5 · recommended ×0.15 · missing ×0 |
| **Ceiling** | — | 0.85: no single control is perfect |

The ceiling was set from the best-measured single control: multi-factor authentication
removes about two thirds of *targeted* attacks (Google), against 99 % of bulk phishing —
and a modelled scenario is a targeted operation. A measure at the top of the strength
scale is therefore an MFA-class control, and the rating says how far below that a
measure sits. The bundled library carries a rating and its evidence for every entry —
MFA, application control, hardening baselines and immutable backups very strong; EDR,
segmentation, patching within days, secure remote access strong; a SIEM, DLP, encryption,
an incident-response plan on its own moderate; awareness training, an asset inventory,
a supplier assessment weak (the table with each entry's evidence is in the calibration
sources note, §10). A measure added from a framework carries no rating, because a
framework says what to do, not how well it works. An **unrated measure counts as very
strong** — what every measure was assumed to be before the rating existed — so nothing
recorded earlier moves. A measure that is only planned and only partly rolled out
protects 14 % of its step.

### What a second measure adds

Measures on one step combine so that the step is only breached if *every* one fails:

```
protected  =  1 − (1 − first) × (1 − second) × …
```

**A second measure only matters where the first one failed.** Those cases are few, so it
has few chances to help, and the third fewer still. With fully rolled-out, very strong
measures on one step, for an attack that by itself needs someone better than half of all
attackers, tried by a capable actor:

| measures on the step | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| step protected | — | 85 % | 98 % | 100 % | 100 % |
| skill the step demands | 50 % | 84 % | 89 % | 90 % | 90 % |
| **of 100 attempts, how many get through** | **64.5** | **6.9** | **3.3** | **2.9** | **2.8** |

Layers on one step run out quickly. **The same measures achieve more spread along the
chain**, because the traversal makes the attacker clear each of them in turn: three
measures on one step leave 25 % of attempts succeeding, the same three on three steps
20 %. The Calibration section draws the curve, switchable by implementation level, so
the trade is visible — four half-rolled-out measures protect 74 %, one finished one 85 %.

### How protection becomes a skill requirement

```
bar at a step  =  demand of the attack  +  0.40 × how well the step is protected
```

The 0.40 is the most preventive measures on one step can ever add to the bar, and it is
the figure that decides how much the rest of this section matters: whether a step is
protected 85 % or 98 % moves the requirement by five points; the difference between no
measure and one is thirty-four.

### The independence assumption, and where it is lifted

The combination formula assumes the measures fail independently. Two that depend on the
same identity provider, the same SIEM or the same administrator do not. Since a measure
can name what it *fails with* (§4), steps whose defence rests on the same cause are drawn
together and two gates on one cause are worth exactly one; a shared dependency nobody
wrote down is still treated as independent, and the model flatters it.

### A measure sits where its technique answers to it

ATT&CK's own mitigation relationships are held against the technique of every step a
preventive measure covers, and the completeness checks flag two things: a preventive
measure on a step whose technique it does not mitigate, and a step whose technique is
hard to prevent at all and is defended only preventively. MFA on the phishing step rather
than where the credential is used is the classic case. The relationships are binary, so
there is no "fit factor" — a factor would be invented per pair.

### The other classes, in numbers

A fully implemented deterrent cuts the attempts by 0.35, an avoidance measure by 0.60
(both scaled by roll-out and lifecycle). Recovery reaches at most 0.60 of a primary loss
— fines, penalties and reputation do not go away because the backups were good;
containment cuts the chance of a follow-on loss by 0.50; detecting the damage as it
happens trims the bill by 0.25. A detective measure carries no constant any more: it
makes the step watched, and the race in §4 decides the rest.

## 6. What a loss costs

The feared event's severity seeds the loss per event as a **lognormal**: measured loss
distributions have a 95th percentile some twenty to fifty times the median and a mean
many times the median, and a bounded band cannot say so. The three points the analyst
sees and edits are the 5th percentile, the median and the 95th; one draw in twenty falls
outside them, mostly above. Recovery is capped: fines, penalties and reputation do not go
away because the backups were good, so a corrective control never drives the loss to
zero. A follow-on loss occurs with a severity-dependent chance.

## 7. What comes out

Per scenario, with and without the current measures (the gap is what the controls buy):

- **Mean annual loss** and percentiles; the **exceedance curve** ("1 in N years costs
  more than …"); the **loss-event frequency**, which is the quantity published incidence
  surveys measure and the one the model is checked against.
- **Where the attempts stop**: out of every 100, how many were not up to the attack at
  all, how many died at each gate, how many were caught in time, how many were seen and
  still got through, how many reached the objective — each row opens the arithmetic
  behind it.
- **What the number hangs on**: every factor pinned to the ends of its own band in turn,
  the rest held — a tornado that names the two or three assumptions the answer rests on
  and shows the rest is noise.
- **What each measure buys**: the mean loss avoided today (the scenario re-simulated
  with the measure taken out) and once complete, against its cost per year where one is
  entered — ranked per euro.
- The **residual position** on the risk matrix, derived from the same traversal: less
  often moves the risk left, less costly moves it down.

The report carries all of it, with the working, so a number is never bare.

## 8. The parameterisation: the shipped defaults and where each comes from

Every number the model runs on lives in one place — the **Calibration** at the top of
the Quantification workshop, folded into four chapters (how often · what it is up
against · what a measure does · what it costs). Each table carries the question it
answers, what changes when it moves, its source, and how much it actually rests on.
**These are settings, and their purpose is to be arguable**: a figure nobody can see is
a figure nobody can correct. Each table is graded, and the grade is shown beside it:

| Grade | Claim |
|---|---|
| **measured** | taken from published measurement; source named, derivation written down |
| **derived** | published measurement plus a stated assumption — check the assumption |
| **judgement** | no published figure answers the question; your view is worth as much as ours |
| **own** | this organisation's record, entered by the analyst |

Of the twenty-one tables, **three are measured, six derived, eleven judgement**, and one
is your own record. Presenting all of them with the same confidence would misrepresent
most of them. The full derivation per table, with the published figures that measure a
different quantity from the one needed, is in
[`calibration-sources.md`](calibration-sources.md). The shipped defaults follow, so this
note is self-contained.

### Base rate — serious operations per year against one organisation · *derived*

| Actor class | Base rate | From |
|---|---|---|
| Opportunist | 1.2 | UK Cyber Security Breaches Survey 2025: 67 % of medium and 74 % of large businesses saw an attack → 1.11–1.35/yr |
| Cybercriminals | 0.35 | ransomware incidence: UK CSBS large businesses 14 % → 0.15/yr; Sophos State of Ransomware (organisations with an IT function) 59 % → 0.89/yr; geometric mean |
| Insider | 0.08 | Verizon DBIR 2025 internal-actor share, applied to the criminal rate |
| Hacktivist | 0.05 | judgement |
| Competitor | 0.03 | judgement |
| State actor | 0.02 | judgement |
| Terrorist | 0.01 | judgement |
| *anything else* | 0.2 | — |

A survey reports **incidence** — the share of organisations that saw at least one event
in twelve months — and *λ = −ln(1 − incidence)* turns it into a rate: 14 % becomes
0.151/yr, 59 % becomes 0.89/yr. The two criminal figures differ by a factor of six, and
the difference is **definitional**, not a disagreement: one survey counts an attack
*seen*, the other a loss *suffered*. Attempts are what goes in; loss events are what the
sources with a denominator count, and what the output is checked against (below).

### Organisation size · *measured*

| Size (headcount) | Factor | From |
|---|---|---|
| Small (10–49) | ×0.73 | Eurostat `isoc_cisce_ic` 2024, EU-27: incidents with a consequence due to attack in 3.15 % of 10–49, 4.34 % of 50–249, 7.05 % of 250+ enterprises → 3.15/4.34, 7.05/4.34 |
| Medium (50–249) | ×1 | the unit the base rates were derived for |
| Large (250–999) | ×1.6 | Eurostat as above; Cyentia IRIS 2025 puts the step from $100M–1B to $1B–10B revenue at 1.5 |
| Very large (1000+) | ×2.5 | IRIS 2025: the tiers above at 3–4, damped because its population is firms with a *public* incident, which over-represents the largest |

Two independent sources within 10 % on the first three steps — the best agreement in the
calibration. Not applied where the base rate comes from your own record.

### Sector exceptions · *measured* (criminal rows), *judgement* (political rows)

| Actor | Sector | Factor | From |
|---|---|---|---|
| Cybercriminals | Healthcare | ×1.25 | Sophos: 67 % hit against 59 % cross-sector → 1.15; IRIS 2025 relative loss-event probability 1.34 → halfway |
| Cybercriminals | Finance & insurance | ×1.25 | Sophos 65 % → 1.10; IRIS 1.44 → halfway |
| Cybercriminals | Manufacturing | ×1.05 | Sophos and IRIS (1.03) agree |
| Cybercriminals | Education & research | ×1.4 | IRIS 1.60, damped |
| Cybercriminals | Technology & telecom | ×1.3 | IRIS 1.55, damped |
| Cybercriminals | Energy & utilities | ×0.8 | IRIS 0.62, damped |
| Insider | Finance & insurance | ×1.2 | judgement |
| Hacktivist | Public sector | ×2.0 | judgement — political targeting is reported as concentrated, but no normalised incidence exists |
| State actor | Public sector · Energy & utilities | ×3.0 | judgement |
| State actor | Technology & telecom | ×2.0 | judgement |
| Terrorist | Public sector | ×2.0 | judgement |

The rows are **much flatter than victim counts suggest, on purpose**. Leak-site tallies
put manufacturing at about a quarter of all 2025 victims and healthcare under a tenth —
but those are counts without a denominator, and a sector with more organisations in it
produces more victims at equal risk. An absent pair means no adjustment, not no risk.

### Your own record · *own*

Years, organisations pooled, and per actor class the serious operations seen over the
whole record. Rate = *(count + ½) ÷ (years × organisations)*; replaces the base rate, the
sector row and the size factor for that class. Zero years = the bundled rates.

### The frequency multipliers · *judgement*, reachability *derived*

| Term | Reads | Values |
|---|---|---|
| Tempo | actor's `activity` | dormant 0.3 · occasional 0.7 · regular 1.0 · persistent 1.6 |
| Throughput | actor's `resources` | 0.7 · 0.9 · 1.1 · 1.4 — mild, and deliberately *not* skill |
| Target pull | declared objectives | objective on what the chain goes after ×1.6 · objectives, none match ×0.5 · none modelled: `relevance` 0.5 · 0.8 · 1.2 · 1.6 |
| Reachability | entry technique | public-facing exploit ×1.5 · external remote services ×1.4 · phishing ×1.3 · valid accounts ×1.2 · supply chain ×0.6 · other ×1.0 |
| Cap | — | never more than 12 attempts/yr on one scenario |
| Likelihood cross-check | — | level boundaries at 0.02 · 0.1 · 0.5 loss events/yr |

Reachability is ordered by the observed initial-access vectors — Verizon DBIR 2025:
stolen credentials 22 % of breaches, exploited vulnerabilities 20 %, phishing 15 %. The
order is that data; the spacing is judgement. Tempo, throughput and target pull have no
source and are held to about a factor of three for that reason.

### The demand terms · entry *derived*, the rest *judgement*

| Term | Values |
|---|---|
| Entry cost | valid accounts 0.05 · phishing 0.15 · external remote services 0.15 · public-facing exploit 0.30 · supply chain 0.45 · other 0.20 (DBIR 2025 vectors; M-Trends 2026 on the access-broker market) |
| Granted access | −0.05 where a stakeholder provides access to the entry asset |
| Tooling | 0 anyone can download it · 0.5 practitioner · 1 has to be built — *maximum* over the chain, weight 0.15 |
| Breadth | distinct tactics, full at 6, weight 0.20 |
| Staying in | persistence, defence evasion or lateral movement, weight 0.12 |
| Floor · spread | 0.02 · ±0.25 either side of the derived bar |
| No chain modelled | 0.20 · 0.30 · 0.40 · 0.50 by the `difficulty` rating |

The per-technique tooling table is the most contestable thing in the calibration —
reasonable analysts disagree about individual techniques — which is why it is editable.

### Attacker capability · *judgement*

| Rating | Band (min · most likely · max) |
|---|---|
| lowest | 0.01 · 0.12 · 0.90 |
| low | 0.05 · 0.32 · 0.93 |
| high | 0.15 · 0.58 · 0.96 |
| highest | 0.35 · 0.82 · 0.99 |

No published distribution of attacker skill exists. The bands are wide because a rating
covers a class, not a person; and every band reaches close to 1 with a thin tail, because
a band stopping short of a bar would make that bar unbeatable — "this control can never
be beaten" is never true.

### What a measure does · *measured*; its strength · *derived*; depth · *judgement*

| Effect | Value | From |
|---|---|---|
| Ceiling — one measure never blocks more than | 0.85 | Google: MFA blocks 100 % of automated attacks, 99 % of bulk phishing, **66 % of targeted** ones |
| Strength, of the ceiling | 0.4 · 0.65 · 0.85 · 1 | steps judgement; the library's assignments from Google (MFA), Marsh McLennan / Cyentia 2023 (patching high-severity CVEs within 7 days halves event probability; automated hardening the largest effect of any control; IR planning, MFA and EDR the top three), M-Trends 2026, ASD Essential Eight |
| Roll-out · lifecycle | 0, ⅓, ⅔, 1 · 1, 0.5, 0.15, 0 | judgement |
| Preventive cover raises the bar by at most | 0.40 | judgement — the term that decides how much the rest matters |
| Deterrent cuts the attempts by | 0.35 | judgement |
| Avoidance cuts them by | 0.60 | judgement |
| Recovery reaches at most this share of a loss | 0.60 | judgement — fines and reputation are not recovered |
| Containment cuts the chance of follow-on loss by | 0.50 | judgement |
| Detecting the damage as it happens trims it by | 0.25 | judgement |
| One-off cost is spread over | 3 years | convention |

### How fast the two sides are · step and response *derived*, alert and speed *judgement*

All in days, lognormal, points read P5 · median · P95. Anchors from Mandiant M-Trends
2026 (2025 data): median dwell **14 days** across all intrusions; **9** where detected
internally, **25** where notified from outside; hand-off from initial access to the
operating group in **22 seconds** (8 hours in 2022); espionage **122 days**.

| Table | Medians | Derivation |
|---|---|---|
| Attacker days per step, by tactic | initial access 0.5 · execution 0.2 · persistence 0.5 · privilege escalation 1 · credential access 1 · discovery 1 · lateral movement 2 · collection 2 · exfiltration 2 · impact 0.5 · reconnaissance 3 | dwell per intrusion apportioned over the tactics a ransomware chain walks — the mail is opened or not, encryption runs in hours — so a five-step chain sums to a few days; the apportioning is the assumption, the totals the measurement |
| Speed by capability | ×2.0 · 1.3 · 0.8 · 0.35 | direction from the hand-off (seconds) against the median dwell (weeks); size judgement |
| Alert by detective strength | weak 20 · moderate 1.5 · strong 0.4 · very strong 0.1 | a log read when asked · a reviewed SIEM · tuned detections · alerting telemetry; anchored so a moderate SIEM with a plan on paper lands on the 9-day internal dwell |
| Response by readiness | none 20 · plan on paper 4 · exercised 1 · 24×7 with authority 0.15 | external against internal dwell (25 vs 9) for a response organised on the day; Marsh/Cyentia: IR planning among the three largest measured effects |

Checked against the outcomes: on a ransomware-shaped chain with three watched steps, a
SIEM and a plan on paper catch 38 % of the intrusions they see (Sophos: about a fifth of
ransomware attacks stopped before encryption, over a population with mixed detection),
telemetry and a 24×7 response 96 %, a response organised on the day 9 %.

### Loss magnitude · *derived*

| Severity | P5 · median · P95 | Anchors |
|---|---|---|
| 1 | 2.7 k · 20 k · 150 k | — |
| 2 | 20 k · 200 k · 2 M | NetDiligence 2025: SME average incident 264 k |
| 3 | 45 k · 600 k · 8 M | IRIS 2025: median loss per incident 603 k (2015–2024, 2024 dollars); healthcare 557 k; NetDiligence healthcare SME 566 k, ransomware 631–663 k |
| 4 | 156 k · 2.5 M · 40 M | IRIS: $1B–10B tier typical 2 M, extreme 62 M; 2024 median 2.9 M, 95th percentile 32 M; IBM 2025 global mean 4.44 M |

Measured loss distributions are lognormal with a 95th percentile twenty to fifty times
the median (IRIS: 603 k against 32 M) and a mean many times the median (14 M). A band
bounded at its maximum cannot say so, which is why the money is drawn lognormal and the
three points are percentiles, not bounds. A single scenario is narrower than a whole
population, so σ sits at 1.2–1.7 against the population's 2–2.4. A follow-on loss occurs
with 0.20 · 0.35 · 0.50 · 0.65 chance by severity, from its own band (medians 10 k ·
100 k · 500 k · 2.5 M).
These are the most organisation-specific numbers here: replace them with your own loss
history rather than adjusting them.

### Where it lives

The calibration is part of the study — stored, exported and imported with it, so two
studies can carry different parameterisations. The study's **sector**, **size** and
**response readiness** are set in the scope workshop, beside the rest of what defines
the perimeter. Changing a calibration table changes every figure in the study, and —
like a taxonomy change — it is **not** recorded in the change log.

### The output is checked against measurement, not only the inputs

Attempts go in; loss events come out; and the sources with a denominator — Eurostat,
IRIS — count loss events. A medium organisation with ordinary controls, attacked by
cybercriminals, should suffer a significant incident at 0.02–0.15 a year; the sample
study's ransomware scenario lands inside that band, and well above it with its controls
removed. One scenario against one band is a check, not a validation. It is the check
most quantitative risk models skip.

## 9. What the method does not claim

- **Most of the calibration is reasoned, not measured.** The base rate is the weakest
  load-bearing number and the one most worth replacing with your own record.
- **Surveys count noticed events.** Everything never detected is missing, which biases
  every rate downward by an unknown amount — in the same direction for all actor classes,
  so orderings are sturdier than levels.
- **Ratios compound.** Four defensible judgements can multiply into a surprising answer.
  Read the tornado before the mean.
- **Ordinal ratings are a shortcut.** A 1–4 rating becomes a wide band, deliberately
  coarse and monotone, so it does not pretend to a precision the input never had.
- **The demand is a classification of how the attack was described.** A chain of
  generic step names produces a generic bar, and says so.
- **Correlated failure is modelled only where it is named.** Shared dependencies nobody
  wrote down are still treated as independent.
- **Detection times are judgement anchored on a few measurements.** The direction is
  measured; the size of each step is not.
- **Loss is one figure**, not decomposed into productivity, response, fines and
  reputation. The cap on recovery stands in for that distinction.
- **Implementation level × lifecycle is a proxy** for whether a control is really
  operating, not an assurance measurement.

Treat the output as a structured, reproducible argument about relative magnitude — good
for comparing scenarios, ranking measures and showing what a control buys. Not as a
prediction.

## 10. Getting better numbers out of a study

In order of payoff: classify every measure; name every step's technique; enter your own
incident record; set the actor category, the sector, the size and the response readiness;
model the objectives the actors declared; model the prerequisites between steps; anchor
measures where they act and name what they fail with; be honest about status and
roll-out; override the loss amounts with what a day of downtime costs you; read the
break points and the tornado before the money; and argue with the calibration — it is a
starting point, not an authority.

---

### Sources

Named at the table they inform; the derivation per table is in
[`calibration-sources.md`](calibration-sources.md). None of the reports travels with the
repository; each is cited under its own terms.

- UK Department for Science, Innovation and Technology — *Cyber Security Breaches Survey 2025*: <https://www.gov.uk/government/statistics/cyber-security-breaches-survey-2025/cyber-security-breaches-survey-2025>
- Verizon — *2025 Data Breach Investigations Report*: <https://www.verizon.com/business/resources/reports/dbir/>
- Sophos — *The State of Ransomware 2024 / 2025* and the sector editions: <https://www.sophos.com/en-us/content/state-of-ransomware>
- Google Cloud / Mandiant — *M-Trends 2025* and *M-Trends 2026*: <https://cloud.google.com/blog/topics/threat-intelligence/m-trends-2026/>
- IBM — *Cost of a Data Breach Report 2025*: <https://www.ibm.com/reports/data-breach>
- Cyentia Institute — *Information Risk Insights Study 2025*: <https://www.cyentia.com/publication/iris2025/>
- NetDiligence — *Cyber Claims Study 2025 Report*: <https://netdiligence.com/cyber-claims-study-2025-report/>
- Eurostat — *ICT security incidents in enterprises* (`isoc_cisce_ic`), 2024 data, free reuse with source acknowledgement: <https://ec.europa.eu/eurostat/databrowser/product/page/isoc_cisce_ic>
- Bitkom Research — *Wirtschaftsschutz 2025* (CC BY 4.0, DOI 10.64022/2025-wirtschaftsschutz)
- Ponemon Institute — *Cost of Insider Risks* (what insider risk costs; measures a different quantity from the insider rate)
- Marsh McLennan / Cyentia Institute — *Using data to prioritize cybersecurity investments*, 2023 (gated; cited from press coverage)
- Google — security research on the effect of multi-factor authentication on automated, bulk-phishing and targeted attacks
- Australian Signals Directorate — *Essential Eight*
- MITRE ATT&CK® — Enterprise matrix, mitigation relationships (© The MITRE Corporation, used under the ATT&CK terms of use)

*The engine, the derivations and the reference cases that pin the model's behaviour are in
the repository (`src/domain/montecarlo.ts`, `quantModel.ts`, `frequency.ts`, `demand.ts`,
`calibration.ts`; `scripts/quant-test.mjs`). All of it is readable, and all of it is meant
to be argued with.*
