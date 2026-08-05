# How the quantification works

A method note for analysts. It explains where the monetary figures come from, what they
do and do not claim, and how to get better ones out of a study. No familiarity with the
code is assumed; no formula here is hidden inside it.

---

## 1. The idea in one paragraph

You have already done the hard part. A workshop-based study names the assets, the actors,
what could go wrong, the routes an attacker would take and the measures in place. That
model contains almost everything a quantitative estimate needs — it is simply written in
ordinal judgements ("likelihood: high") rather than in numbers. **So the quantification
derives its inputs from the study instead of asking you to estimate them again.** Only
the loss amounts stay yours to state, because nothing in a qualitative model knows what
an outage costs. Everything else is read from the model you already built, and every
figure can name the entity it came from.

## 2. The risk equation

Risk is expressed the standard way: how often a loss happens, times what it costs.

```
Annual loss  =  loss event frequency  ×  loss magnitude

  loss event frequency = threat event frequency × vulnerability
      threat event frequency = contact frequency × probability of action
      vulnerability          = P(attacker capability > resistance)

  loss magnitude       = primary loss + secondary risk
      secondary risk         = follow-on likelihood × follow-on loss
```

Nothing is computed as a single "expected" number. Each factor is a **range** sampled
many times over simulated years (a Monte-Carlo run), so the result is a distribution: a
typical year, a bad year, and the tail that actually threatens an organisation. The
median annual loss of a rare, severe scenario is often zero — the mean and the 99th
percentile are where the story is.

## 3. Where each number comes from

| Factor | Read from | Meaning |
|---|---|---|
| Contact frequency | risk source `activity` | how often this actor comes at you at all |
| Probability of action | operational scenario `likelihood` | how often contact turns into an attempt |
| Attacker capability | risk source `capability` | how strong the actor is, as a **share of the attacker population** |
| Resistance | scenario `difficulty` + the measures on the chain | what the attacker has to beat |
| Primary loss | feared event `severity` | your estimate, seeded from the severity |
| Follow-on | feared event `severity` | your estimate |

The capability and resistance scales share one axis: **the share of the overall attacker
population**. A resistance of 0.78 means "holds off 78 % of attackers"; a capability of
0.70 means "outperforms 70 % of them". The attempt succeeds when the drawn capability
exceeds the drawn resistance. Keeping that reading intact is what makes the comparison
mean something rather than being a contest between two invented numbers.

## 4. The kill chain is the calculation

Most tools treat a kill chain as documentation and then quantify a scenario as a single
gate. Here the chain **is** the model.

For every simulated attempt:

1. The attacker draws **one** capability — a property of the attacker, not of each
   comparison. A capable attacker stays capable for the whole attempt.
2. He must beat the scenario's **baseline resistance** once, before the chain starts.
3. Then he walks the chain in order, honouring each step's prerequisites — `all` of the
   predecessors (a true conjunction) or `any` of them (an alternative route).
4. At a step that **blocks**, he must beat that step's resistance. At a step that
   **detects**, there is a chance the intrusion is broken off there.
5. A loss event occurs **only if he reaches a terminal step** — the objective.

Four consequences worth understanding, because they change how you should model:

**Describing the chain in more detail never makes it look safer.** Only steps with a
measure on them are hurdles; steps with nothing on them cost the attacker nothing. If
finer decomposition added resistance by itself, the model would reward prose over
security. The baseline difficulty is charged once per attempt, not once per step.

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

## 5. What a measure does depends on what kind it is

The most consequential design decision: **a measure is defined, for quantification
purposes, by the mechanism it works through** — not by how much effort it took. Five
classes, each with its own channel into the model:

| Class | Where you anchor it | What it moves |
|---|---|---|
| **Preventive** | the step it covers | resistance at that step — the attacker has to beat it |
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

A measure with no class stated is treated as preventive — today's behaviour — and the
completeness checks flag it, so the assumption is visible rather than silent.

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

## 6. Why every number is a range, and how the ranges were chosen

### Ranges, not points

An analyst rating a scenario's difficulty as "moderate" is not making a statement
accurate to two decimals. The established practice in quantitative risk work is
**calibrated estimation**, whose central empirical finding is that untrained estimators
are systematically overconfident: their ranges are far too narrow. The model builds that
correction in — each ordinal rating maps to a wide band, with the mass concentrated
around the rating.

This is not cosmetic. An earlier calibration of this tool used narrow bands, and the
consequences were measured:

- One click on the four-level difficulty scale swung the result from 71 % to 12 %.
- Seven of sixteen capability × difficulty combinations sat at exactly 0 % or 100 % — and
  in a saturated cell, no measure can ever show an improvement.
- A top-tier actor facing a mature programme succeeded **0.6 %** of the time.

The cause was not any single constant. It was **step size versus spread**: one difficulty
level moved resistance by half the entire width of the capability band, so a single click
jumped across the whole decision zone. Hence the rule the calibration now follows:

> A step on an ordinal scale must be small relative to the spread of the band it moves
> within. Otherwise one click of a coarse judgement decides the analysis.

One more subtlety with a real effect: the distributions have **hard bounds**. A capability
band that stops short of a control's strength yields *exactly zero* vulnerability — and
"this control can never be beaten" is never a true statement. Every capability band
therefore reaches close to the top, with a thin tail: even an unskilled attacker
occasionally walks into an unpatched server with a working public exploit.

### Calibrated against situations, not taste

The constants are fitted so the model reproduces situations whose rough behaviour is not
seriously disputed:

| Situation | Expected | Model |
|---|---|---|
| No controls at all, competent crew | 85–100 % | 98 % |
| Baseline hygiene, 3 of 5 steps controlled | 15–45 % | 36 % |
| Mature programme, every step controlled | 3–15 % | 4 % |
| Top-tier actor vs. that same programme | 20–60 % | 29 % |
| Low-skill opportunist vs. baseline hygiene | 1–15 % | 1.4 % |
| Monitoring but no barriers | 30–70 % | in band |
| Detection nobody can act on | 55–90 % | in band |

Plus four behavioural guardrails: no situation is written off as impossible; **no
configuration of controls reduces a top-tier actor to zero** (12 % still get through when
everything money can buy is in place); one scale step never swings the result by more
than 3×; a single control is worth a factor of 2–4, and a half-deployed one keeps a
visible but clearly partial share.

All of this is asserted in the automated tests. A future change that moves a constant
back into the "threshold detector" regime fails the build rather than quietly producing
confident nonsense. The target bands are deliberately wide engineering judgements — they
do not claim precision, they rule out answers no practitioner would sign.

## 7. Reading the results

**Annual loss (ALE), with percentiles.** The mean is what you budget against; P90 and P99
are the bad years. A P50 of zero is normal for a rare severe scenario.

**Inherent vs. residual.** The same scenario simulated with and without the measures. The
gap is what your controls buy, in currency.

**Where the attempts are stopped.** Out of every 100 attacks on the chain: the share
stopped by the scenario's own difficulty, the share stopped at each step, and the share
that reaches the objective. This is usually the most actionable output in the tool — it
answers *where does my money work* far better than any single figure. In the sample's
ransomware chain, 59.8 % of attempts die at the phishing step, because a fully implemented
mail gateway sits on the single entry point of that chain.

**Chain defence ring.** The same picture aggregated: blocked / detected in time / reaches
the objective.

**The risk matrix.** Residual position is derived from the same traversal, split across
the two axes: the reduction in event frequency moves the risk left, the reduction in loss
magnitude moves it down. A treatment that only buys recovery therefore moves a risk
*down*, not left — which is what recovery does.

**Tactic defence.** How consistently each tactic's steps are defended — the share of them
that something blocks or detects. Note the difference: this says nothing about how likely
an attack is to fail, because that depends on where those steps sit in the chain. A
tactic defended to 100 % on a route the attacker does not need changes nothing.

## 8. What the model does not claim

Stated plainly, because a quantitative output invites more confidence than it earns:

- **The constants are conventions, not measurements.** They are anchored to reproduce
  plausible situations, not derived from incident data.
- **Ordinal inputs are a shortcut.** Strict practice would have you estimate calibrated
  ranges directly rather than convert 1–4 ratings into numbers. Deriving from the
  qualitative model is the whole point of this tool, but it is a trade: the mapping is
  kept deliberately coarse and monotone so it does not pretend to a precision the input
  never had.
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

## 9. Getting better numbers out of a study

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
2. **Model the predecessors.** Without them a chain is read as a straight line in step
   order. With them, alternative routes and true conjunctions are evaluated properly —
   and that is where "this control protects nothing" becomes visible.
3. **Anchor measures where they act.** `covers` puts a measure on a step; `protects` puts
   it at an asset. A corrective control anchored on a step it does not protect will not
   be counted where it belongs.
4. **Be honest about status and implementation level.** They are the only signals the
   model has for whether a control is actually working. A wall of "Implemented, level 4"
   produces a confident and wrong picture.
5. **Override the loss amounts.** Severity seeds a plausible range, but only you know
   what a day of downtime costs. Every derived factor can be overridden, and the override
   is saved with the study.
6. **Read the break-point distribution before the money.** If 90 % of attempts die at one
   step, your risk figure is a statement about that one control — and worth stress-testing
   before anyone budgets against it.

---

*This note describes the model as it stands in this release. It follows the established
frequency × magnitude approach to quantitative risk analysis and the more recent thinking
on how controls actually take effect. Constants, reference situations and guardrails live
in `src/domain/quantModel.ts` and `scripts/quant-test.mjs` - both are readable, and both
are meant to be argued with.*
