# Where the calibration numbers come from

Status: **current** · 2026-08-09, second reading 2026-09-12 (§9), time tables 2026-09-13 (§11)

This note backs every default in the Calibration view: the source, the derivation, and —
where there is no source — a plain statement that the number is reasoned rather than
measured. It exists so the figures can be checked and disagreed with, which is the only
thing that makes a quantitative model worth arguing about.

Each table in the app carries one of three grades, and they are shown next to it:

| Grade | Claim |
|---|---|
| **measured** | Taken from published measurement. Source named, derivation written down. |
| **derived** | Computed from published measurement plus a stated assumption. Check the assumption. |
| **judgement** | Reasoned. No published figure answers this question. Your view is worth as much as ours. |

Six of the fourteen tables are measured or derived. **Eight are judgement**, and saying so
is the point: a model that presented all fourteen with the same confidence would be
misleading about thirteen of them.

---

## 1. What published sources measure, and what a model needs

Security reporting sets out to describe what happened. A risk model needs a rate. Those are
different quantities, and most of the work below is the bridge between them.

Incident reports — DBIR, M-Trends, leak-site trackers — count **events in a sample**, which
is what they are for: what share of breaches involved ransomware, which sector produced the
most victims. A rate for *one organisation* needs something they do not set out to carry,
a denominator — the organisations that were exposed and not breached.

Only one kind of source has a denominator: a **representative survey** that asks a known
population "did you experience X in the last twelve months". That gives **incidence** — the
share of organisations that saw at least one event — and incidence converts to a rate:

```
λ  =  −ln(1 − p)          p = share seeing at least one event in a year
```

This is the Poisson relationship: if events arrive at λ per year, the chance of seeing none
is e^(−λ), so the chance of seeing at least one is 1 − e^(−λ). For small p the two are
nearly equal (p = 0.14 → λ = 0.151); the correction matters at high incidence
(p = 0.59 → λ = 0.89).

Everything below that is called *derived* uses this route. Everything that uses incident
counts uses them for **ordering and relative size only**, never for a rate.

## 2. Base rate per actor class — *derived*

The one number the whole frequency side hangs off, and the one with the widest honest
uncertainty.

**Opportunist — 1.2 attacks/yr.** The UK Cyber Security Breaches Survey 2025 is a
representative survey of UK businesses. It reports **67 % of medium and 74 % of large
businesses** identifying a breach or attack in the last twelve months, which converts to
**1.11 and 1.35 per year**. Opportunistic attacks dominate that count — phishing was
experienced by 85 % of the businesses that were hit. 1.2 sits inside that band.

*Caveat:* the survey counts anything the business noticed, including phishing mail that
went nowhere. Read the resulting rate as "attacks of the opportunistic kind that get far
enough to be noticed", which is roughly the granularity of a modelled opportunist scenario.

**Cybercriminals — 0.35 attacks/yr.** Two credible anchors, and they disagree:

| Source | Population | Incidence | Rate |
|---|---|---|---|
| UK CSBS 2025 | all UK large businesses | 14 % identified ransomware | 0.151/yr |
| Sophos State of Ransomware | organisations of 100–5,000 staff | 59 % hit | 0.89/yr |

A factor of six. They survey different populations — Sophos respondents all run an IT
function — and they count differently: "identified ransomware" against "adversaries
succeeded in encrypting, or tried to". Neither is wrong; they measure different things.

The default sits at their **geometric mean, 0.37**, rounded to 0.35. Organisations that run
formal risk analysis resemble the Sophos population more than the UK average, so if you
are large and well-instrumented, the honest move is to raise this toward 0.9.

**Insider — 0.08 attacks/yr.** Verizon DBIR consistently puts internal actors at roughly a
fifth of breaches. Applied to the criminal rate: 0.35 × (18/82) ≈ 0.077.

*A published figure that measures a different quantity.* The Ponemon Cost of Insider Risks
2025 reports **25 insider-related incidents per organisation per year**, about 13.8 of them
arising from negligence. That is a wider event class than this table needs: it covers every
insider-related event across large enterprises, careless data handling and policy breaches
included. A modelled insider scenario is one deliberate act by one privileged person, so
the two quantities are not interchangeable and the rate here comes from the breach share
instead. For the question that report does answer — what insider risk costs an organisation
across all its forms — it remains the better source.

**Hacktivist 0.05 · Competitor 0.03 · State actor 0.02 · Terrorist 0.01 — judgement.**
No representative survey measures these. They are placed an order of magnitude or more
below the criminal rate because that is the consistent picture from incident-response
reporting: most organisations never encounter a state actor, and those that do usually know
why. Treat the spacing, not the values.

## 3. Sector exceptions — *measured*, and the table the data corrected

This is where open-source data changed our answer most.

The obvious move is to read sector exposure off leak-site tallies. In 2025 those recorded
roughly **7,300–7,900 victims**, with manufacturing the largest sector (about a quarter of
all victims by one count) and healthcare well under a tenth. Taken as a measure of
per-organisation risk, that would place manufacturing several times above healthcare.

Those tallies count victims, which is what they set out to do. Turning a count into a rate
needs a denominator they do not carry: how many organisations each sector contains. A
sector with more of them produces more victims whatever the risk to any one.

The normalised figures point the other way, and much more gently. Sophos surveys the same
question sector by sector, among comparable organisations:

| Sector | Hit by ransomware | Against the cross-sector figure |
|---|---|---|
| Healthcare | 67 % | ×1.15 |
| Financial services | 65 % | ×1.10 |
| *cross-sector* | 59 % | ×1.00 |

So the sector multipliers came **down from 1.8 / 1.5 / 1.4 to 1.15 / 1.10 / 1.10**. Sector
matters far less than raw victim counts suggest, once you divide by how many organisations
each sector contains.

The **state-actor and hacktivist rows are the deliberate exception** and remain judgement at
×2 to ×3. Their targeting is political rather than opportunistic and is consistently
reported as concentrated on public administration, energy and telecommunications — but no
normalised incidence figure exists, so the number is reasoning, not measurement.

## 4. Reachability by entry technique — *derived*

Verizon DBIR 2025 reports the ways in: **stolen credentials 22 % of breaches, exploited
vulnerabilities 20 %, phishing 15 %**, with third-party involvement doubling to 30 %.

This revised an earlier setting. The table had treated *valid accounts* as the rarest route
at ×0.8, on the reasoning that it needs an account to begin with. The data puts credential
abuse first among the ways in. Identity surfaces are internet-facing and
attacked continuously, so it now sits at ×1.2, above phishing.

*The assumption you should check:* a breach share mixes how often contact happens with how
often it succeeds, and only the first belongs in this table. The shares are used for the
**ordering**; the spacing between the multipliers is judgement.

## 5. What a measure is worth — *measured*, and the best-supported table here

Two independent sources, pulling the same way.

**Prevention.** Google's security research on MFA reports that it blocks **100 % of
automated bot attacks, 99 % of bulk phishing, and 66 % of targeted attacks**.

That gradient is the whole argument of this model in one line. The 99 % is the figure
usually quoted; **66 % is the one that applies to us**, because a modelled scenario is a
targeted operation. Even a strong, fully deployed, best-in-class control removes about two
thirds of targeted attempts — not nearly all of them.

Our model, measured against its own reference cases, makes a single fully implemented
control worth **a factor of 2.5** on vulnerability, i.e. about 60 % removed. That lands just
below the MFA figure, which is right: MFA is close to the best a single control can do, and
the ceiling of 0.85 encodes the same limit.

**Detection.** Mandiant M-Trends 2026 reports how organisations found out, for ransomware
specifically: **30 % detected it internally, 49 % learned of it when the attacker announced
it, 21 % were told by an outside party.** Median dwell time across all incidents was 14
days.

So even with monitoring in place, most organisations still find out when the ransom note
appears. The detection constant — how much of a fully implemented detective control
converts into actually breaking off an intrusion — is 0.35, against that measured 30 %.
The response floor of 0.20 reflects the 21 % who were told from outside without detecting
anything themselves.

**Recovery — judgement.** The cap at 0.60 says backups cannot reach the whole loss.
Supported in kind rather than in number by the cost components IBM reports: detection and
escalation, notification, lost business and response. Restoring from backup addresses
business interruption; it does nothing about notification duties, regulatory exposure or
reputation.

## 6. Loss magnitude — *derived*

IBM Cost of a Data Breach 2025 reports a **global average of USD 4.44M** (down 9 %, the
first fall in five years), with **healthcare highest at 7.42M**, financial services 5.56M
and industrial 5.00M. Mean time to identify and contain: 241 days.

The top severity band is anchored on 4.44M — deliberately at the **top** of the scale, not
in the middle. It is a mean over large organisations with a long tail behind it; treating it
as typical would overstate the ordinary case. The bands stay wide for the same reason.

These remain the numbers a generic default fits least well. The sector spread in the same
data — 7.42M against 5.00M — is larger than anything else in this calibration, and it is
about *your* organisation, not about the attacker. Replace them outright if you have loss
history.

## 7. The tables that rest on nothing but reasoning

Stated plainly, because the badge in the app is only useful if it is honest:

- **Tempo, throughput** — no source measures whether one actor is busier or better resourced
  than typical for its class. Both are held deliberately narrow so an uncheckable term
  cannot move the answer far.
- **Target pull** — the strongest study-specific lever and the least supported. No dataset
  records which victims an actor had declared an interest in beforehand.
- **Attacker capability bands** — a modelling construct. Nobody publishes a distribution of
  attacker skill.
- **Tooling maturity per technique** — no dataset grades techniques by difficulty of
  execution. The most contestable table in the calibration, which is exactly why it is
  editable.
- **Entry-cost spacing, demand weights, difficulty fallback, likelihood boundaries** —
  conventions chosen to reproduce defensible reference cases.

## 8. What this exercise did not fix

**The base rate still carries almost all the uncertainty.** A factor of six between two
credible surveys is not resolved by picking the middle; it is parked there. Anyone with
their own incident history should replace it, and that single change is worth more than
every other adjustment in this document — since 2026-09 the calibration has a table for
exactly that (*Your own record*: counts per actor class over N years, rate = (n + ½) ÷
exposure, grade *own*; see `docs/method.md §2`).

**Incidence surveys measure noticed events.** Everything that was never detected is missing
from the denominator's numerator, which biases every rate here downward by an unknown
amount. That bias runs in the same direction for all actor classes, so the *orderings* are
sturdier than the levels.

**Nothing here is European-specific.** The surveys are UK, US and global. A study in a
specific jurisdiction with its own reporting regime should expect different figures.

---

## 9. Second reading, 2026-09-12 — four sources with a denominator

Fetched for step B2 of the roadmap; the files and their licences are in `docs/sources/`.
The first reading (§1–8) rested on surveys that report *whether an organisation saw an
attack*. This one adds sources that report *whether it suffered a loss event*, by size
class and with a denominator, and a claims study that reports what those events cost.
Each subsection ends with what changed in the calibration and why.

### 9.1 What each source measures

| Source | Population | The question it answers | Unit |
|---|---|---|---|
| **Eurostat `isoc_cisce_ic`** (2024, EU-27 and member states) | all enterprises ≥ 10 persons, NACE C–N | share of enterprises that had an ICT security incident *with a consequence* in the year — unavailability of ICT services due to attack (ransomware, DoS), destruction/corruption of data by malware or intrusion, disclosure of confidential data by intrusion, phishing or a malicious insider | incidence of a **loss event**, by 10–49 / 50–249 / ≥ 250 persons |
| **Cyentia IRIS 2025** (Zywave/Advisen incident data, 2008–2024) | firms with a *publicly known* significant incident, modelled against the firm population | annual probability that a typical firm has a significant incident; relative probability by revenue tier and sector; distribution of the loss per incident | **loss event** probability; USD, 2024 dollars |
| **NetDiligence Cyber Claims Study 2025** (> 10,000 insured claims 2020–2024, 98 % SME < $2B revenue, 2 % large) | insured organisations that filed a claim | cost of an incident by revenue band, sector and cause; split into crisis services, business interruption, recovery, legal | **cost per insured incident**, USD |
| **Bitkom Wirtschaftsschutz 2025** (n = 1,002 German firms ≥ 10 staff, ≥ €1M revenue) | German businesses | share *affected* by each attack type in twelve months, attributed actor, ransom paid | incidence of **being affected** (attempt or damage), Germany |

### 9.2 The factor of six, explained

§8 parked the criminal base rate between two surveys that disagree by a factor of six. The
second reading shows the gap is definitional, not statistical. Three figures for the same
population type in the same year:

| Figure | Value | What it counts |
|---|---|---|
| UK CSBS 2025, large businesses "identified a breach or attack" | 74 % | attempts noticed, phishing included |
| Bitkom 2025, "Schäden durch Ransomware" in twelve months | 34 % | affected by ransomware, self-reported, damage of any size |
| Eurostat 2024, DE, ≥ 250 persons, unavailability of ICT services due to attack | 7.5 % | a loss event with an operational consequence |
| Eurostat 2024, EU-27, ≥ 250 persons, same | 7.1 % | |
| IRIS 2025, typical firm, significant (publicly known) incident | 9.3 % | a loss event that became public |

Attempt-level incidence and loss-event incidence differ by a factor of five to ten, and
the model has both quantities: the base rate is *attempts*, the traversal turns them into
*loss events*. So the survey with attempts in it stays the source of the base rate, and the
loss-event sources become what they always should have been — **a reference for the
model's output**, §9.6.

### 9.3 Organisation size — a new dimension of the base rate · *measured*

Every source that has a denominator finds the same shape: the larger the organisation,
the more often it is hit, and the effect is stronger than any sector effect.

| Size | Eurostat EU-27 2024, unavailability due to attack | any incident | IRIS 2025, relative probability of a loss event |
|---|---|---|---|
| 10–49 persons | 3.15 % | 19.9 % | < $10M revenue 0.60× · $10M–100M 0.67× |
| 50–249 | 4.34 % | 28.0 % | $100M–1B 0.80× |
| ≥ 250 | 7.05 % | 38.3 % | $1B–10B 1.20× |
| *very large* | — | — | $10B–100B 2.49× · > $100B 3.46× |

The bundled base rates were derived from the UK survey's medium and large businesses,
so the calibration's "one organisation" is a **medium** one. Relative to it: small
0.73 (Eurostat 3.15/4.34; the any-incident column gives 0.71), large 1.6 (7.05/4.34 =
1.62; any-incident 1.37; IRIS $1B–10B against $100M–1B 1.5), very large 2.5 (IRIS
$10B–100B against $100M–1B is 3.1, > $100B 4.3; taken below the data because the
IRIS population is firms with a *public* incident, which over-represents the largest). Two
independent sources within 10 % of each other on the small and large steps is the best
agreement in this calibration.

**Changed:** a `size` field on the study (small / medium / large / very large by
headcount, matching Eurostat's classes) and a size table in the frequency calibration,
multiplying the base rate: **0.73 / 1.0 / 1.6 / 2.5**. Grade *measured* for the first
three steps, *derived* for the fourth. Unset = medium, which is what every figure before
this change assumed.

### 9.4 Sector rows — a second source

IRIS reports relative probability of a loss event by sector, all actors together:
education 1.60×, information 1.55×, professional 1.50×, financial 1.44×, healthcare
1.34×, public 1.34×, retail 1.19×, manufacturing 1.03×, transportation 0.78×, utilities
0.62× (relative to the median sector). These carry a size effect — large firms are in the
sectors that report — and IRIS says so; they cannot be read as clean as the Sophos
ransomware incidence in §3. Where the two agree, the row is confirmed; where they
disagree, the row moves halfway.

| Actor × sector | Was (Sophos) | IRIS | Now |
|---|---|---|---|
| Cybercriminals × Healthcare | 1.15 | 1.34 | **1.25** |
| Cybercriminals × Finance & insurance | 1.10 | 1.44 | **1.25** |
| Cybercriminals × Manufacturing | 1.10 | 1.03 | **1.05** |
| Cybercriminals × Education & research | — (no source) | 1.60 | **1.4** *new* |
| Cybercriminals × Technology & telecom | — | 1.55 | **1.3** *new* |
| Cybercriminals × Energy & utilities | — | 0.62 | **0.8** *new* — the state-actor ×3 on the same sector stands; the two rows are different actors |

The political rows (hacktivist, state, terrorist) are untouched: IRIS pools actors and
says nothing about them. Grade stays *measured*.

### 9.5 Loss magnitude — from a bounded band to a lognormal · *derived*

The first reading anchored the top severity band on IBM's $4.44M mean and said it was the
table that fit least well. The second reading has three distributions to check it against:

| Source | Population | Typical | Extreme |
|---|---|---|---|
| IRIS 2025, all incidents 2015–2024 | firms with a public incident | median **$603K**, geometric mean $464K | 95th percentile **$32M**, mean $14M |
| IRIS 2025, by revenue: < $10M · $10M–100M · $100M–1B · $1B–10B | | typical $403K · $329K · $467K · $2M | extreme $10M · $7M · $12M · $62M |
| IRIS 2025, healthcare | | median $557K | 95th $14M |
| NetDiligence 2025, SME (avg. revenue $108M) | insured claims | average incident **$264K**; ransomware $631K–663K; with business interruption $1.2M | max $10.4M (< $50M rev.) · $25M ($50–300M) · $108M ($300M–2B) |
| NetDiligence 2025, SME healthcare | | average $566K | max $105M |
| Bitkom 2025, ransom paid (of the 15 % who paid) | German firms | mostly €100K–500K (34 %), €10K–100K (19 %) | > €1M (4 %) |

Three things follow.

1. **The shape is lognormal with a heavy tail.** IRIS: median $603K against a 95th
   percentile of $32M is a ratio of 53, which for a lognormal is σ = ln(53)/1.645 =
   **2.4**; within one revenue tier it is 1.9–2.1; the mean is 23× the median. A PERT band
   is bounded at its maximum and cannot produce that: the model's loss distribution has
   been too thin on the right, and the exceedance curve's tail with it.
2. **The severity bands were in the right place for their median, low for their tail.**
   The top band's mode (4.4M) sits at IRIS's $1B–10B typical loss; its maximum (20M) sits
   below the 95th percentile of every population above.
3. **A scenario is narrower than a population.** IRIS's σ = 2.4 mixes every sector,
   size and event type. One feared event on one asset in one organisation does not span
   five orders of magnitude; within a revenue tier the data gives σ ≈ 2, and a
   single-scenario spread of **σ ≈ 1.2–1.5** is what the bands below encode.

**Changed:** money factors (direct and cascading impact) are drawn from a **lognormal**
whose median is the band's middle value and whose 5th and 95th percentiles are the
band's outer values: σ = (ln max − ln min) / 3.29. The three points stay what the analyst
edits; they are no longer hard bounds — one draw in twenty falls outside them, and that
tail is the point. The bands were re-set so that the median follows IRIS/NetDiligence
typical losses and the top point their 95th percentiles, and made symmetric on the log
scale (min = median²/max) so the outer points are exactly the percentiles they claim:
severity 1 · 2 · 3 · 4 = 2.7K–20K–150K · 20K–200K–2M · 45K–600K–8M · 156K–2.5M–40M
(P5–median–P95, σ = 1.2 · 1.4 · 1.6 · 1.7, EUR ≈ USD at the precision these figures
carry). The mean of the top band is now ≈ $10M against IBM's $4.44M mean for large
organisations, which is where the mean of a heavy tail sits — and the severity-3 mean
$2.1M against a median of $600K, the ratio IRIS reports within a revenue tier. Grade
*derived*: the medians are measured, the assignment of a population's percentile to a
severity level is the stated assumption.

### 9.6 The output, checked against the loss-event sources · *reference*

With attempts on the input side and loss events on the output side, the model can be
checked end to end: a medium organisation with ordinary controls, attacked by
cybercriminals, should suffer a significant incident at the rate the loss-event sources
report. Eurostat 2024 (50–249 persons): 4.3 % unavailability due to attack, 2.3 % data
destruction, 2.2 % disclosure — as Poisson rates 0.044, 0.023, 0.022, together (they
overlap) about 0.05–0.08 loss events per year. IRIS: 9.3 % for a typical firm, all
causes, of which about half is criminal in DBIR's actor split — 0.05/yr.

The sample study's ransomware scenario lands at a loss-event frequency inside that
range (see the reference case in `scripts/quant-test.mjs`), which is the first time the
model's *output* has been held against a measurement rather than its inputs. It is one
scenario against one band; it is not a validation. It is the check that was missing.

### 9.7 What this reading did not change

- **Tempo, throughput, target pull, capability bands, tooling** — still nothing measures
  them. Unchanged, still judgement.
- **The base rate's level.** Its dimension changed (size); its level did not, because
  the sources with a denominator measure loss events, not attempts, and §9.2 says why
  that is the right thing for them to check rather than to set.
- **Germany-specific rates.** Bitkom's 34 % ransomware-affected and 87 % affected by
  anything are attempt-level; Eurostat's German rows (≥ 250: 7.5 % unavailability due
  to attack, 40 % any incident) sit within 10 % of the EU-27 figures. The bundled rates
  are not made country-specific; the *own record* table (§8, method §9) is the way to a
  German figure that is actually yours.

## 10. What a measure is worth — the library's ratings · *derived*

Until 2026-09 every measure reached the ceiling when fully in force: MFA and a password
policy were worth the same. The ceiling (0.85) was set from MFA against targeted attacks
(§5), so every measure was silently assumed to be an MFA-class control. The `strength`
rating says how far below that a measure sits — weak 0.4, moderate 0.65, strong 0.85,
very strong 1.0 of the ceiling — and multiplies with roll-out and lifecycle. An unrated
measure counts as very strong, so nothing recorded before the rating existed moves.

The **steps are judgement**; the **assignments below are not** — each names what it rests
on. Marsh McLennan / Cyentia (2023) is cited second-hand from press coverage of a gated
report: patching high-severity CVEs within seven days halves the probability of an event;
automated hardening has the largest measured effect of any control; MFA only when
implemented fully; incident-response planning, MFA and EDR the top three. Google's MFA
figures and Mandiant's detection sources are in §5.

| Ref | Measure | Strength | Evidence |
|---|---|---|---|
| IAM-01 | Multi-factor authentication | very strong (4) | Google: MFA blocks 66% of targeted attacks, 99% of bulk phishing, 100% of automated; Marsh/Cyentia 2023: top-3 control when implemented fully |
| IAM-02 | Least-privilege access | strong (3) | reduces what a compromised account can reach; ASD Essential Eight 'restrict administrative privileges' (top 8); no per-control likelihood figure |
| IAM-03 | Privileged access management | strong (3) | Marsh/Cyentia 2023: privileged access management among the controls with a measured effect on event likelihood |
| IAM-04 | Periodic access reviews & timely offboarding | moderate (2) | removes stale access; effect indirect and slow - no published likelihood effect |
| IAM-05 | Single sign-on / centralised identity | moderate (2) | reduces credential sprawl; effect through what it enables (MFA, revocation), not on its own |
| NET-01 | Network segmentation | strong (3) | limits lateral movement; DBIR/M-Trends consistently name flat networks in ransomware spread; no per-control figure |
| NET-02 | Firewall & egress filtering | moderate (2) | narrows the attack surface; egress filtering breaks some C2 and exfiltration; effect partial |
| NET-03 | Secure remote access (VPN / ZTNA) | strong (3) | removes standing exposed services; DBIR 2025: exploited vulnerabilities in edge devices a leading vector |
| END-01 | Endpoint detection & response (EDR) | strong (3) | Marsh/Cyentia 2023: EDR top-3 control; M-Trends: internal detection finds 30% of ransomware intrusions |
| END-02 | Patch & vulnerability management | strong (3) | Marsh/Cyentia 2023: patching high-severity CVEs within 7 days halves the probability of an event |
| END-03 | Secure configuration / hardening baseline | very strong (4) | Marsh/Cyentia 2023: automated hardening the largest measured effect of any control studied |
| END-04 | Application allow-listing | very strong (4) | ASD Essential Eight: application control first among the mitigations; blocks unapproved execution outright |
| DAT-01 | Encryption at rest | moderate (2) | protects confidentiality of data at rest; does not stop an attacker with a live session; effect on loss, not on likelihood |
| DAT-02 | Encryption in transit | moderate (2) | protects data in motion; effect against interception only |
| DAT-03 | Key management | moderate (2) | makes encryption hold; no effect on its own |
| DAT-04 | Data classification & handling | weak (1) | governance; effect through the controls it directs |
| DAT-05 | Data loss prevention (DLP) | moderate (2) | detects and blocks part of exfiltration; bypassable, high false-positive load in practice |
| BCK-01 | Backups with tested restore | strong (3) | Sophos 2025: backups the most common recovery route; tested restore is what makes it one |
| BCK-02 | Offline / immutable backups | very strong (4) | immutable or offline copies survive ransomware that reaches the backups; the difference between paying and not |
| BCK-03 | Disaster-recovery & continuity plan | strong (3) | shortens downtime - the largest loss component in NetDiligence 2025 (BI averages 1.2M at SMEs) |
| LOG-01 | Centralised logging & monitoring (SIEM) | moderate (2) | M-Trends 2026: only 30% of ransomware intrusions found by internal detection; logs are the precondition, not the detection |
| LOG-02 | Alerting & 24/7 detection coverage | strong (3) | detection that is acted on around the clock; M-Trends: dwell time falls where detection is internal |
| LOG-03 | File integrity & configuration monitoring | moderate (2) | detects persistence and tampering on covered files; narrow scope |
| IR-01 | Incident response plan | moderate (2) | Marsh/Cyentia 2023: incident-response planning top-3 - but the plan alone; its worth is realised through response readiness |
| IR-02 | Incident response exercises | strong (3) | an exercised plan is what shortens response; NetDiligence: response time drives crisis and BI cost |
| EML-01 | Email authentication (SPF/DKIM/DMARC) | moderate (2) | stops spoofing of the own domain; does nothing against lookalike domains or compromised senders |
| EML-02 | Email & web content filtering | strong (3) | blocks the bulk of malicious attachments and links; Google: bulk phishing near-fully blockable, targeted far less |
| PPL-01 | Security awareness training | weak (1) | reduces click rates modestly; DBIR: the human element in 60% of breaches persists with training - a weak control on its own |
| PPL-02 | Phishing simulation | moderate (2) | measurable reduction in click and credential-entry rates over repeated campaigns; still a fraction of targeted lures |
| APP-01 | Secure development lifecycle | moderate (2) | fewer vulnerabilities shipped; effect slow and indirect |
| APP-02 | Application & dependency scanning | moderate (2) | finds known vulnerabilities in code and dependencies; effect through patching |
| ASM-01 | Asset inventory | weak (1) | no direct effect on any attack; the precondition for every other control |
| ASM-02 | Third-party / supply-chain risk assessment | weak (1) | assessment, not control; supply-chain compromise is rare and rarely stopped by the assessment |
| ASM-03 | Change & configuration management | moderate (2) | prevents unreviewed change; narrow effect on attack likelihood |
| PHY-01 | Physical access control | strong (3) | stops physical access outright where enforced; Eurostat: physical incidents a small share |

A measure added from a *framework* (NIS2, NIST CSF, SP 800-53) carries no rating: a
framework says what to do, not how well it works. Rate it by hand, or map it onto a
library entry.

## 11. How fast the two sides are — the time tables · *derived / judgement*

Detection became a race on 2026-09-13 (`docs/detection-time-race.md`). Four tables, all in
days, all lognormal with points read P5 / median / P95.

**What the sources measure.** Mandiant M-Trends 2026 (2025 data): median dwell **14
days** across all intrusions (11 the year before); **9 days** where the organisation
detected the intrusion itself, **25** where it was told from outside; 52 % detected
internally; hand-off from the initial-access broker to the operating group in **22
seconds** (8 hours in 2022); cyber-espionage and DPRK IT-worker cases **122 days**.
Sophos 2024/25: roughly a fifth of ransomware attacks stopped before data was encrypted.
Marsh McLennan / Cyentia 2023: incident-response planning among the three controls with
the largest measured effect.

| Table | What it holds | Derivation | Grade |
|---|---|---|---|
| `time.stepDays` per tactic | attacker days per step | dwell per intrusion apportioned over the tactics a ransomware chain walks: initial access and impact in hours (the mail is opened or not; encryption runs in hours), lateral movement, collection and exfiltration in days, so that a five-step ransomware chain sums to a few days at typical pace — the reported dwell of such operations | derived |
| `time.capabilitySpeed` by capability | ×2.0 / 1.3 / 0.8 / 0.35 on every step | direction from the hand-off figure (seconds) against the median dwell (weeks); size judgement | judgement |
| `time.detectDays` by detective strength | weak 20 d · moderate 1.5 d · strong 0.4 d · very strong 0.1 d (medians) | anchored so that a moderate SIEM with a plan on paper reproduces the internal-detection dwell; the steps are judgement | judgement |
| `time.respondDays` by readiness | none 20 d · plan on paper 4 d · exercised 1 d · 24×7 0.15 d (medians) | external against internal dwell (25 vs 9) for what a response organised on the day costs; the exercised and 24×7 levels from the IR-planning effect | derived |

**Checked against the outcomes.** On a ransomware-shaped chain with three watched steps,
a SIEM and a plan on paper catch 38 % of the intrusions they see (Sophos: about a fifth of
attacks stopped before encryption, over a population with mixed detection); telemetry
and a 24×7 response 96 %; a response that has to be organised on the day 9 %. The
reference cases are pinned in `scripts/quant-test.mjs`.

## Sources

- UK Department for Science, Innovation and Technology — *Cyber Security Breaches Survey
  2025*: <https://www.gov.uk/government/statistics/cyber-security-breaches-survey-2025/cyber-security-breaches-survey-2025>
- Verizon — *2025 Data Breach Investigations Report*:
  <https://www.verizon.com/business/resources/reports/dbir/>
- Sophos — *The State of Ransomware 2025* and the sector editions:
  <https://www.sophos.com/en-us/content/state-of-ransomware>
- Google Cloud / Mandiant — *M-Trends 2026*:
  <https://cloud.google.com/blog/topics/threat-intelligence/m-trends-2026/>
- Google Cloud / Mandiant — *M-Trends 2025*:
  <https://cloud.google.com/blog/topics/threat-intelligence/m-trends-2025/>
- IBM — *Cost of a Data Breach Report 2025*:
  <https://www.ibm.com/think/insights/cost-of-a-data-breach-healthcare-industry>
- Ponemon Institute — *Cost of Insider Risks* (on the total cost of insider risk, §2):
  <https://www.ponemon.org/news-updates/blog/security/lessons-learned-from-the-2026-global-cost-of-insider-risks.html>
- Breachsense — *Ransomware Annual Report 2025* (leak-site tallies, §3):
  <https://www.breachsense.com/ransomware-reports/annual-report-2025/>
- Eurostat — *ICT security incidents in enterprises* (`isoc_cisce_ic`), 2024 data, accessed
  2026-09-12 (free reuse with source acknowledgement):
  <https://ec.europa.eu/eurostat/databrowser/product/page/isoc_cisce_ic>
- Cyentia Institute — *Information Risk Insights Study 2025: It's About Time* (figures 6–10,
  A1–A4): <https://www.cyentia.com/publication/iris2025/>
- NetDiligence — *Cyber Claims Study 2025 Report* (figures 2–3, 32; tables by revenue size and
  sector): <https://netdiligence.com/cyber-claims-study-2025-report/>
- Bitkom Research — *Wirtschaftsschutz 2025* (CC BY 4.0, DOI 10.64022/2025-wirtschaftsschutz):
  <https://www.bitkom.org/sites/main/files/2025-12/bitkom-studienbericht-wirtschaftsschutz-2025_2.pdf>
