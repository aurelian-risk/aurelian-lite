# Where the calibration numbers come from

Status: **current** · 2026-08-09

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
every other adjustment in this document.

**Incidence surveys measure noticed events.** Everything that was never detected is missing
from the denominator's numerator, which biases every rate here downward by an unknown
amount. That bias runs in the same direction for all actor classes, so the *orderings* are
sturdier than the levels.

**Nothing here is European-specific.** The surveys are UK, US and global. A study in a
specific jurisdiction with its own reporting regime should expect different figures.

---

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
