# How the quantification works

A method note for analysts. It explains where the monetary figures come from, what they
do and do not claim, which numbers the model runs on, and how to get better ones out of a
study. No familiarity with the code is assumed; no formula here is hidden inside it.

---

## 1. The idea in one paragraph

You have already done the hard part. A workshop-based study names the assets, the actors,
what could go wrong, the routes an attacker would take and the measures in place. That
model contains almost everything a quantitative estimate needs — it is simply written in
ordinal judgements ("likelihood: high") rather than in numbers. **So the quantification
derives its inputs from the study instead of asking you to estimate them again.** Only
the loss amounts stay yours to state, because nothing in a qualitative model knows what
an outage costs. Everything else is read from the model you already built, every figure
can name the entity it came from, and every setting it uses is on the table in the
Calibration view rather than buried in the code.

## 2. The risk equation

Risk is expressed the standard way: how often a loss happens, times what it costs.

```
Annual loss  =  loss event frequency  ×  loss magnitude

  loss event frequency = attempts per year × vulnerability
      attempts per year      = derived from the actor and the exposure   (§4)
      vulnerability          = P(attacker capability > the bar)          (§5, §6)

  loss magnitude       = primary loss + secondary risk
      secondary risk         = follow-on likelihood × follow-on loss
```

Nothing is computed as a single "expected" number. Each factor is a **range** sampled
many times over simulated years (a Monte-Carlo run), so the result is a distribution: a
typical year, a bad year, and the tail that actually threatens an organisation. The
median annual loss of a rare, severe scenario is often zero — the mean and the 99th
percentile are where the story is.

Two of those quantities are themselves derived from the study rather than rated by hand,
and they are what the next two sections are about.

## 3. Where each number comes from

| Factor | Read from | Meaning |
|---|---|---|
| Attempts per year | actor class + sector, `activity`, `resources`, target objectives, entry technique | how often this scenario is attempted at all |
| Attacker capability | risk source `capability` | how strong the actor is, as a **share of the attacker population** |
| The bar | the kill chain itself, plus the measures on it | what an attempt has to beat |
| Primary loss | feared event `severity` | your estimate, seeded from the severity |
| Follow-on | feared event `severity` | your estimate |

The capability and the bar share one axis: **the share of the overall attacker
population**. A bar of 0.78 means "holds off 78 % of attackers"; a capability of 0.70
means "outperforms 70 % of them". The attempt succeeds when the drawn capability exceeds
the drawn bar. Keeping that reading intact is what makes the comparison mean something
rather than being a contest between two invented numbers.

## 4. How often a scenario is attempted

### One number, not two

Quantitative risk models conventionally split this in two: how often the actor comes into
contact with you, and how often contact turns into an attempt. **This model does not,
because the split is not identifiable from real data.**

| | contact | probability of action |
|---|---|---|
| Opportunistic, passive contact | observable (scans against an exposed surface) | observable (share that become attempts) |
| Targeted | ≈ 1 — the contact *is* the decision | carries everything |
| Insider | continuous, ≈ 1 | carries everything |

Outside the first row, splitting the number in two produces *a factor of one multiplied by
the real quantity*, and presents it as two insights. So the model derives one quantity —
**attempts per year** — and the probability of action is absorbed into it.

The second reason is more specific to this method. The older model read the probability
of action from the operational scenario's `likelihood` rating. But in a workshop method
the likelihood of an operational scenario is a *holistic judgement* that already absorbs
the actor, the effort, the opportunity and the controls in place. Using it as one isolated
input is circular: the model derives a frequency that is partly an echo of the conclusion
you already reached, while the same considerations enter a second time through
vulnerability.

### The derivation

```
attempts / year =  base rate      (actor class × sector)   ← the one figure that needs evidence
                 × tempo          (activity)
                 × throughput     (resources)
                 × target pull    (objectives, or relevance)
                 × reachability   (entry technique)
                 × deterrence and avoidance, where measures of those kinds exist
```

The shape is deliberate: **all the empirical burden sits in the base rate.** Everything
else is a ratio, and every ratio answers a question you can actually defend — "is this
asset one the actor declared an objective on, yes or no", "is the entry surface reachable
from the internet, yes or no".

**Target pull is the strongest study-specific lever**, and the one that answers the
question every audience asks first: *why us*. If the chain ends at a business asset the
actor has declared an objective on, attempts are markedly more frequent; if the actor has
objectives and none of them match, markedly less. Modelling target objectives properly is
the cheapest way to make this figure yours rather than generic.

**Reachability and the entry cost read the same field, and ask different things of it.**
The entry step's technique tells the frequency side how easily contact happens, and the
success side how much skill the first foothold takes. One classification, two outputs —
not one effect counted twice.

> **What becomes of `likelihood`.** It is no longer an input — it is a **cross-check**.
> The model reaches its own answer without it, maps that back onto the likelihood scale,
> and where the two disagree by more than one level says so next to the annual-loss
> figure. Because the rating never entered the calculation, that really is a second
> opinion rather than an echo. A gap of exactly one level is not reported: the bands are
> too coarse for it to mean anything.

## 5. What an attempt is up against

### Derived from the chain, not rated

Previously a single `difficulty` rating set the baseline an attacker had to beat. That had
three problems, and they compounded.

**The rating could not see what you had already modelled.** In the bundled sample, the
ransomware chain spans six distinct tactics, needs persistence and lateral movement, and
requires credential dumping; the insider chain is three tactics long, starts from
legitimate credentials, and needs nothing beyond copying files. All of that was modelled
in detail — and then compressed into "2" versus "1".

**It double-counted with the measures.** Anyone rating difficulty is thinking partly about
the defences in place. Those defences then entered a second time as resistance at each
step. The same consideration moved the bar twice.

**It sat on the wrong side of the comparison.** How much skill an operation intrinsically
requires is a property of the *attack*. Resistance should be what the *organisation* does.

So the bar is now derived from the chain, and the resistance side belongs solely to the
measures you modelled:

```
the bar =  entry cost          what it takes to get the first foothold
         + tooling maturity    the hardest thing the attacker must be able to do
         + breadth             how many distinct tactics the chain spans
         + dwell               whether the attack has to stay inside undetected
```

Worked on the sample study, where both chains are modelled fully:

| | entry | tooling | breadth | dwell | **the bar** |
|---|---|---|---|---|---|
| Ransomware via maintenance access | 0.100 | +0.075 | 6 tactics → +0.200 | +0.120 | **0.495** |
| Insider exfiltration | 0.050 | +0.000 | 3 tactics → +0.080 | +0.000 | **0.130** |

The ransomware entry cost is 0.100 rather than the 0.150 a phish normally costs, because
the scenario enters through a stakeholder that *grants access to* the asset the entry step
targets. That access was given, not taken, and the model says so.

Read the second row honestly: an insider with valid credentials and a USB port is up
against almost nothing except your controls. That is the intended answer, and it is
higher risk than the old rating produced.

### The property that shapes every term

> **Decomposition invariance.** Splitting one step into two describes the same attack in
> more detail. It must not change the answer.

This is why the terms look the way they do. Tooling takes the **maximum** over the chain,
not the sum or the average — the hardest thing you must be able to do is what stops you,
and a maximum does not move when a step is split. Breadth counts **distinct tactics**, not
steps. Neither a sum over steps nor a step count would survive the rule, and a model that
rewarded finer prose with a higher difficulty would be rewarding documentation over
security.

Two things deliberately stay out. **AND-joins** are not added to the bar: a step requiring
all its predecessors is genuinely harder, but the traversal already makes it harder by
requiring every branch to get through, and adding it here would count it twice. **The
measures** stay out because they are the other side of the comparison — that separation is
the whole point of the change.

### When there is nothing to derive from

A scenario with no modelled chain has no bar to read, so the `difficulty` rating carries
on as before. A technique the calibration does not recognise falls back to its tactic; a
step with neither contributes nothing rather than a guess. The completeness checks point
at all three cases, so a figure resting on a fallback is visible rather than silent.

## 6. The kill chain is the calculation

Most tools treat a kill chain as documentation and then quantify a scenario as a single
gate. Here the chain **is** the model.

For every simulated attempt:

1. The attacker draws **one** capability — a property of the attacker, not of each
   comparison. A capable attacker stays capable for the whole attempt.
2. He must clear what the attack itself demands (§5) before the chain starts.
3. Then he walks the chain in order, honouring each step's prerequisites — `all` of the
   predecessors (a true conjunction) or `any` of them (an alternative route).
4. At a step that **blocks**, he must beat that step's resistance, which is the demand
   plus what the measures there add. At a step that **detects**, there is a chance the
   intrusion is broken off there.
5. A loss event occurs **only if he reaches a terminal step** — the objective.

Four consequences worth understanding, because they change how you should model:

**Describing the chain in more detail never makes it look safer.** Only steps with a
measure on them are hurdles; steps with nothing on them cost the attacker nothing. The
demand is charged once per attempt, not once per step, and it is derived in a way that is
itself invariant to how finely you decomposed.

**Alternative routes are only as strong as the weakest one.** Putting a control on a
branch the attacker does not need is worth nothing — the model says so, loudly. Two
controls on one route, by contrast, are better than one.

**Detection only counts if someone acts on it.** Its effect is scaled by the response
capability derived from the corrective measures on the scenario. Monitoring with no
ability to respond approaches — deliberately — no effect at all.

**Detection on the objective itself cannot prevent anything.** Catching ransomware while
it encrypts does not stop the loss event; it shortens it. That effect is therefore
applied to the magnitude, not to the frequency.

### The loss-event definition

> A loss event occurs when a terminal step of the chain is reached. Initial compromise is
> not a loss event.

This single definition is what makes the detection channel sound. An attack broken at
lateral movement never became a loss event, so removing it from the frequency is not
double counting. Everything else follows from it.

## 7. What a measure does depends on what kind it is

**A measure is defined, for quantification purposes, by the mechanism it works through** —
not by how much effort it took. Five classes, each with its own channel into the model:

| Class | Where you anchor it | What it moves |
|---|---|---|
| **Preventive** | the step it covers | the bar at that step — the attacker has to beat it |
| **Detective** | the step it covers | the chance the intrusion is broken off there |
| **Corrective** | the asset it protects | the loss, and the chance of follow-on damage |
| **Deterrent** | the scenario | how many attempts are made at all |
| **Avoidance** | the asset it protects | how often the actor makes contact at all |

Why this matters, in one example from the bundled sample study: *offline immutable
backups* are a corrective control on the ransomware chain. Under a model that treats
every measure as resistance, they make the attack **less likely to succeed** — which is
false. Backups do not prevent encryption; they make it cheaper. Here they reduce the
loss and the follow-on risk, and leave the probability of encryption exactly where it
was. Symmetrically, a deterrent belongs on the number of attempts, not on your ability to
withstand one.

A measure with no class stated is treated as preventive — and the completeness checks flag
it, so the assumption is visible rather than silent.

**None of the classes is second-rate.** A view that counts only what stops an attacker at
a step — the defence bars, the tactic heatmap — necessarily leaves the other three out,
and that is easy to misread as "these do not count". They do, on a different factor:
corrective measures act on **the loss** (damage control — what the attack costs once it
succeeds), deterrent and avoidance measures on **the number of attacks**. Both move the
annual-loss figures. An organisation whose ransomware exposure is carried by immutable
backups is not badly protected — it is protected on the magnitude side, and the model
should be read accordingly.

**Recovery is capped on purpose.** Only part of a loss can be recovered at all:
regulatory fines, contractual penalties and reputational damage do not go away because
the backups were good. A fully implemented corrective control therefore never drives the
loss toward zero.

## 8. The parameterisation, and how to change it

Every number both derivations run on lives in one place — the **Calibration** section of
the Quantification workshop — where
each table carries the question it answers, what changes when you move it, its source, and
how much it actually rests on. **These are settings, and their purpose is to be arguable**:
a figure nobody can see is a figure nobody can correct.

Each table is graded, and the grade is shown next to it:

| Grade | Claim |
|---|---|
| **measured** | Taken from published measurement. Source named, derivation written down. |
| **derived** | Computed from published measurement plus a stated assumption. Check the assumption. |
| **judgement** | Reasoned. No published figure answers this question. Your view is worth as much as ours. |

Six of the fourteen tables are measured or derived; **eight are judgement**. Presenting all
fourteen with the same confidence would misrepresent thirteen of them. The full derivation
of every figure, with sources and with the anchors that were considered and rejected, is in
[`calibration-sources.md`](calibration-sources.md).

The tables below are the shipped defaults, reproduced so this note is self-contained.

### Base rate — attacks per year against one organisation · *derived*

The single figure the whole frequency side hangs off. Everything else in the derivation is
a ratio applied to it.

| Actor class | Base rate | Sector exceptions | From |
|---|---|---|---|
| Opportunist | 1.2 | — | 67 % of medium / 74 % of large UK businesses saw an attack |
| Cybercriminals | 0.35 | healthcare ×1.15 · finance ×1.10 · manufacturing ×1.10 | ransomware incidence, 14 % to 59 % depending on population |
| Hacktivist | 0.05 | public sector ×2.0 | judgement |
| Insider | 0.08 | finance ×1.2 | internal-actor share of breaches |
| Competitor | 0.03 | — | judgement |
| State actor | 0.02 | public sector ×3 · energy ×3 · technology ×2 | judgement |
| Terrorist | 0.01 | public sector ×2 | judgement |
| *anything else* | 0.2 | — | — |

The route from a survey to a rate is the Poisson one: a survey reports **incidence**, the
share of organisations that saw at least one event in twelve months, and
**λ = −ln(1 − incidence)**. 14 % becomes 0.151/yr; 59 % becomes 0.89/yr.

Two things are worth knowing before you rely on this table.

**The criminal rate is parked between two credible surveys that disagree by a factor of
six** — 0.15/yr from a representative survey of all UK large businesses, 0.89/yr from a
survey of organisations large enough to run an IT function. The default is their geometric
mean. If your organisation looks like the second population, raise it.

**The sector multipliers are much flatter than raw victim counts suggest, and this is
deliberate.** Leak-site tallies put manufacturing at about a quarter of all 2025 victims
and healthcare under a tenth — but those are counts without a denominator, and a sector
with more organisations in it produces more victims whatever its risk. Measured as
incidence among comparable organisations, healthcare runs at 67 % against a 59 %
cross-sector figure: a factor of **1.15, not 1.8**. The state-actor and hacktivist rows are
the deliberate exception and stay judgement.

**If you have your own incident history, replacing the base rate is worth more than every
other adjustment in this document put together.** An absent sector pairing means no
adjustment, not no risk.

### The frequency multipliers

| Term | Read from | Values |
|---|---|---|
| Tempo | `activity` | dormant 0.3 · occasional 0.7 · regular 1.0 · persistent 1.6 |
| Throughput | `resources` | 0.7 · 0.9 · 1.1 · 1.4 |
| Target pull | objectives | declared objective ×1.6 · has objectives, none match ×0.5 |
| … or, with no objectives modelled | `relevance` | 0.5 · 0.8 · 1.2 · 1.6 |
| Reachability *(derived)* | entry technique | public-facing exploit ×1.5 · external remote services ×1.4 · phishing ×1.3 · valid accounts ×1.2 · supply chain ×0.6 · anything else ×1.0 |
| Cap | — | never more than 12 attacks/yr on one scenario |
| Likelihood cross-check | — | level boundaries at 0.02 · 0.1 · 0.5 loss events/yr |

Throughput is deliberately mild, and deliberately **not** skill: how good the actor is
belongs to capability, on the other side of the model. Tempo, throughput and target pull
are all *judgement* — no source measures them, so they are held narrow on purpose.

Reachability is ordered by how often each vector is actually the way in: stolen credentials
lead at 22 % of breaches, exploited vulnerabilities follow at 20 %, phishing at 15 %. That
evidence corrected an earlier setting which had treated valid accounts as the **rarest**
route — credential abuse is in fact the most common one.

### The demand terms

| Term | Values |
|---|---|
| Entry cost | valid accounts 0.05 · phishing 0.15 · external remote services 0.15 · public-facing exploit 0.30 · supply chain 0.45 · anything else 0.20 |
| Granted access | −0.05 where a stakeholder provides access to the entry step's asset |
| Tooling maturity | 0 anyone can download it · 0.5 takes a practitioner · 1 has to be built — **maximum** over the chain, weight 0.15 |
| Breadth | distinct tactics, full value at 6, weight 0.20 |
| Dwell | persistence, defence evasion or lateral movement, weight 0.12 |
| Spread | ±0.25 either side of the derived bar |
| Fallback, no chain modelled | 0.20 · 0.30 · 0.40 · 0.50 by `difficulty` |

The per-technique tooling table is the most contestable thing in the calibration —
reasonable analysts disagree about individual techniques, which is precisely why it is
editable rather than fixed.

### Attacker capability *(judgement)*, and what a measure is worth *(measured)*

| Rating | Band (min · most likely · max) |
|---|---|
| lowest | 0.01 · 0.12 · 0.90 |
| low | 0.05 · 0.32 · 0.93 |
| high | 0.15 · 0.58 · 0.96 |
| highest | 0.35 · 0.82 · 0.99 |

| Effect | Value |
|---|---|
| Preventive measure raises the bar at its step by | 0.40 |
| Detective measure converts into an interruption at | 0.35 |
| … and some response happens even with nobody assigned | 0.20 |
| Deterrent cuts the number of attacks by | 0.35 |
| Avoidance cuts them by | 0.60 |
| Recovery reaches at most this share of the loss | 0.60 |
| Containment cuts the chance of follow-on losses by | 0.50 |
| Spotting the damage as it happens trims the bill by | 0.25 |
| One single measure never blocks more than | 0.85 |
| Counted by lifecycle status | implemented 1 · planned 0.5 · recommended 0.15 · missing 0 |

These are the best-supported numbers in the calibration. Published research on MFA reports
that it blocks **100 % of automated attacks, 99 % of bulk phishing — and 66 % of targeted
ones.** That gradient is this model's argument in a single line: the 99 % is the figure
usually quoted, but a modelled scenario is a *targeted* operation, so 66 % is the one that
applies. Even a strong, fully deployed, best-in-class control removes about two thirds of
targeted attempts. Our model makes a single fully implemented control worth a factor of
2.5, just below that — which is why the ceiling sits at 0.85.

Detection is pinned by incident-response data on how organisations actually found out. For
ransomware: **30 % detected it internally, 49 % learned of it when the attacker announced
it, 21 % were told from outside.** So even with monitoring in place, most organisations
still find out when the ransom note appears — hence a detection value of 0.35, and a
response floor of 0.20 for the ones who were told rather than found it.

The loss-magnitude tables are read from feared-event severity. The top band is anchored on
the **USD 4.44M global average** from published breach-cost research, placed at the top of
the scale rather than in the middle: it is a mean over large organisations with a long tail
behind it, and treating it as typical would overstate the ordinary case. These stay the
most organisation-specific numbers in the set — the same severe outage costs a hospital and
a software vendor entirely different amounts. Replace them outright if you have loss
history.

### Where it lives

The calibration is part of the study. It is stored with it, exported with it and imported
with it — there is no separate file and no separate step. Two studies can therefore carry
different parameterisations, which is what you want when they cover different
organisations.

It sits at the top of the **Quantification** workshop, above the figures it produces. The
study's **sector** — which selects the base-rate exceptions — is set in the scope workshop,
alongside the rest of what defines the perimeter.

> One consequence to state plainly: changing these numbers changes every figure in the
> study, and — like taxonomy changes — it is **not** recorded in the change log.

## 9. Why every number is a range, and how it was calibrated

### Ranges, not points

An analyst rating a scenario is not making a statement accurate to two decimals. The
established practice in quantitative risk work is **calibrated estimation**, whose central
empirical finding is that untrained estimators are systematically overconfident: their
ranges are far too narrow. The model builds that correction in — each ordinal rating maps
to a wide band, with the mass concentrated around the rating.

This is not cosmetic. An earlier calibration of this tool used narrow bands, and the
consequences were measured:

- One click on the four-level difficulty scale swung the result from 71 % to 12 %.
- Seven of sixteen capability × difficulty combinations sat at exactly 0 % or 100 % — and
  in a saturated cell, no measure can ever show an improvement.
- A top-tier actor facing a mature programme succeeded **0.6 %** of the time.

The cause was not any single constant. It was **step size versus spread**: one difficulty
level moved the bar by half the entire width of the capability band, so a single click
jumped across the whole decision zone. Hence the rule the calibration now follows:

> A step on an ordinal scale must be small relative to the spread of the band it moves
> within. Otherwise one click of a coarse judgement decides the analysis.

One more subtlety with a real effect: the distributions have **hard bounds**. A capability
band that stops short of a bar yields *exactly zero* vulnerability — and "this control can
never be beaten" is never a true statement. Every capability band therefore reaches close
to the top, with a thin tail: even an unskilled attacker occasionally walks into an
unpatched server with a working public exploit.

### Two calibrations, kept apart

Since the bar is now derived rather than rated, there are two separate things to get
right, and mixing them would mean a failure could not say which one broke.

**The comparison** — given a bar and a set of measures, what share of attempts gets
through. Its reference cases set the bar explicitly, so they test the arithmetic alone:

| Situation | Expected | Model |
|---|---|---|
| No controls at all, competent crew | 85–100 % | 98.4 % |
| Baseline hygiene, 3 of 5 steps controlled | 15–45 % | 36.0 % |
| Mature programme, every step controlled | 3–15 % | 3.9 % |
| Top-tier actor vs. that same programme | 20–60 % | 28.4 % |
| Low-skill opportunist vs. baseline hygiene | 1–15 % | 1.6 % |
| Monitoring, with someone able to respond | 30–70 % | 37.2 % |
| Monitoring nobody can act on | 55–90 % | 77.7 % |

**The derivation** — whether a chain you modelled comes out where a practitioner would put
it. Its reference cases work on the demand and the attempt rate directly: a phishing-led
ransomware campaign has to land between 0.45 and 0.65; an insider path from valid accounts
between 0.08 and 0.20; an opportunist against an internet-facing service between 0.8 and 5
attempts a year; a state actor against an organisation it has declared no interest in
below 0.1. Alongside them sit the properties that must hold whatever the numbers are:
splitting a step changes nothing, more distinct tactics never demand less, an unmodelled
step contributes nothing, and no stack of multipliers turns one scenario into a weekly
event.

### Behavioural guardrails

Beyond the bands: no situation is written off as impossible; **no configuration of
controls reduces a top-tier actor to zero** (12.5 % still get through when everything
money can buy is in place); one scale step never swings the result by more than 3×; a
single control is worth a factor of 2–4 (measured: 2.5×), and a half-deployed one keeps a
visible but clearly partial share.

All of this is asserted in the automated tests. A change that moves a number back into the
"threshold detector" regime fails the build rather than quietly producing confident
nonsense. The target bands are deliberately wide engineering judgements — they do not
claim precision, they rule out answers no practitioner would sign.

## 10. Reading the results

**Annual loss (ALE), with percentiles.** The mean is what you budget against; P90 and P99
are the bad years. A P50 of zero is normal for a rare severe scenario.

**Inherent vs. residual.** The same scenario simulated with and without the measures. The
gap is what your controls buy, in currency.

**Attempts per year, traced.** The factor popup shows the multiplication term by term —
base rate, tempo, throughput, target pull, reachability — so you can see which one is
carrying the answer rather than only the product.

**What the attack demands, traced.** The same treatment for the bar: getting in, tooling,
breadth, staying in, and the total. If a chain looks too easy or too hard, this says which
term to argue with.

**Where the attempts are stopped.** Out of every 100 attacks on the chain: the share
stopped because the attacker was not up to the attack at all, the share stopped at each
step, and the share that reaches the objective. This is usually the most actionable output
in the tool — it answers *where does my money work* far better than any single figure. In
the sample's ransomware chain, 59 % of attempts die at the phishing step, because a fully
implemented mail gateway sits on the single entry point of that chain.

**Chain defence ring.** The same picture aggregated: blocked / detected in time / reaches
the objective.

**The risk matrix.** Residual position is derived from the same traversal, split across
the two axes: the reduction in event frequency moves the risk left, the reduction in loss
magnitude moves it down. A treatment that only buys recovery therefore moves a risk
*down*, not left — which is what recovery does.

**Copy for an LLM.** The whole quantification as text: the model's rules, the parameters
in force with their grades, every derived term broken out rather than only its product,
the chain with its measures, the results, and the stated limits. It is deliberately
self-describing — numbers alone invite a language model to invent the method that produced
them.

**Tactic defence.** How consistently each tactic's steps are defended — the share of them
that something blocks or detects. Note the difference: this says nothing about how likely
an attack is to fail, because that depends on where those steps sit in the chain. A
tactic defended to 100 % on a route the attacker does not need changes nothing.

## 11. What the model does not claim

Stated plainly, because a quantitative output invites more confidence than it earns:

- **Most of the calibration is reasoned, not measured.** Six of its fourteen tables rest on
  published figures; eight are judgement, and each says which it is. The base rate is the
  weakest load-bearing number — two credible surveys of it differ by a factor of six — and
  the one most worth replacing with your own figures.
- **Published incidence measures NOTICED events.** Everything never detected is missing,
  which biases every rate here downward by an unknown amount. The bias runs the same way
  for all actor classes, so the orderings are sturdier than the levels.
- **Ratios compound.** An actor rated below average on tempo, throughput, pull and
  reachability lands well below its base rate — four defensible judgements can multiply
  into a surprising answer. Read the traced derivation, not the base rate alone.
- **Ordinal inputs are a shortcut.** Strict practice would have you estimate calibrated
  ranges directly rather than convert 1–4 ratings into numbers. Deriving from the
  qualitative model is the whole point of this tool, but it is a trade: the mapping is
  kept deliberately coarse and monotone so it does not pretend to a precision the input
  never had.
- **The demand is a classification, not a measurement.** It reads how you described the
  attack. A chain described with generic step names and no techniques will produce a
  generic bar, and it will say so rather than pretend otherwise.
- **Correlated control failure is not modelled.** Two measures depending on the same
  administrator, platform or bypass fail together; the model treats their resistance as
  independent. Correlation is modelled on the attacker's side only, through the single
  capability draw.
- **Loss is one figure, not decomposed** into productivity, response, replacement, fines,
  competitive advantage and reputation. The cap on recovery stands in for that
  distinction.
- **Magnitude is scenario-level.** Routes ending at different assets would strictly be
  different scenarios; merging them is deferred rather than approximated.
- **Implementation level × lifecycle status is a proxy** for whether a control is really
  operating. It is not an assurance measurement.

Treat the output as a structured, reproducible argument about relative magnitude — good
for comparing scenarios, prioritising measures and showing what a control buys. Not as a
prediction.

## 12. Getting better numbers out of a study

Practical, in order of payoff:

1. **Classify every measure.** The effect class is the single most consequential field in
   the model. An unclassified measure is counted as preventive, which flatters a chain
   defended only by monitoring or backups. The completeness checks list them.

   The checks know about the effect model, so they catch what a plain "is anything
   attached" count cannot: chains **defended by detection alone** (watched everywhere,
   barred nowhere), chains that are **monitored with nothing to respond with**, steps
   whose only measures are damage control, treatments decided as *Reduce* with nothing
   reducing them, and chains modelled as a straight line because no step names its
   prerequisites. Work that list before trusting the money.
2. **Name the entry technique.** One field that sharpens both sides at once: how easily
   the actor gets into contact, and how much skill the first foothold takes. A chain
   whose first step says only "initial access" gets a generic answer to both.
3. **Set the actor category and the study's sector.** Together they select the base rate,
   which the whole frequency side hangs off. Without them every actor is charged the same
   generic figure.
4. **Model target objectives.** They are what tells the model this actor wants something
   of *yours* — the strongest study-specific term in the attempt rate, and the one that
   answers "why us".
5. **Model the predecessors.** Without them a chain is read as a straight line in step
   order. With them, alternative routes and true conjunctions are evaluated properly —
   and that is where "this control protects nothing" becomes visible.
6. **Anchor measures where they act.** `covers` puts a measure on a step; `protects` puts
   it at an asset. A corrective control anchored on a step it does not protect will not
   be counted where it belongs.
7. **Be honest about status and implementation level.** They are the only signals the
   model has for whether a control is actually working. A wall of "Implemented, level 4"
   produces a confident and wrong picture.
8. **Override the loss amounts.** Severity seeds a plausible range, but only you know
   what a day of downtime costs. Every derived factor can be overridden, and the override
   is saved with the study.
9. **Read the break-point distribution before the money.** If 90 % of attempts die at one
   step, your risk figure is a statement about that one control — and worth stress-testing
   before anyone budgets against it.
10. **Argue with the calibration.** It is a starting point, not an authority. Open it,
    read what each table is for, and change what you disagree with — that is what it is
    there for.

---

*This note describes the model as it stands in this release. It follows the established
frequency × magnitude approach to quantitative risk analysis and the more recent thinking
on how controls actually take effect. The parameterisation is in the Calibration section
of the Quantification workshop and in `src/domain/calibration.ts`; the derivations are in
`src/domain/frequency.ts` and `src/domain/demand.ts`; the reference cases and guardrails
are in `scripts/quant-test.mjs`. All of it is readable, and all of it is meant to be
argued with.*
