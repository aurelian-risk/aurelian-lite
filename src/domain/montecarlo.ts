// Deterministic Monte-Carlo risk quantification - own engine, no external libs,
// runs offline in the browser. Generic quantitative-risk model: how often a loss
// event happens (frequency) times how much it costs (magnitude), aggregated over
// many simulated years into an annual-loss distribution.
//
// Model per simulated year (the standard frequency/magnitude quantitative-risk
// Monte-Carlo, matching the common open-source risk engines):
//   attempts        = Poisson( attempt_rate )
//   per attempt:     the attacker draws ONE capability and has to clear the scenario's
//                     demand; where a kill chain is modelled he then has to walk it (see
//                     below). Getting through is a LOSS event - Vulnerability
//                     = P(capability > the bar) falls out empirically.
//   per loss event:  loss = direct_impact + (rand < cascading_likelihood ? cascading_impact : 0)
//   annual loss     = sum of the per-loss-event losses
//
// Chain traversal (optional `chain` argument): the steps are walked in topological
// order, honouring each step's AND/OR join over its predecessors. A step only stops the
// attacker if something DEFENDS it - undefended steps are transparent and cost no roll,
// so splitting a scenario into more steps does not by itself make it more resistant.
// The attacker's capability is drawn once per attempt and reused for every gate: a
// capable attacker gets through all of them, which is the correlation a naive
// per-gate redraw would miss. A loss event requires reaching a terminal step.
// Aggregated over N iterations -> annual-loss distribution (ALE), percentiles, a
// loss-exceedance curve and a histogram. Every 3-point estimate is drawn as a
// smooth PERT (beta) distribution whose peakedness (lambda) is user-adjustable.

/** Three-point estimate (min / most-likely / max), sampled as a PERT (smooth
 *  beta) distribution. `lambda` is the shape weight on the mode (peakedness):
 *  the classic PERT uses 4; lower spreads the mass out (toward uniform at 0),
 *  higher concentrates it around the mode. Optional - defaults to 4. */
export interface Range { min: number; mode: number; max: number; lambda?: number }

export const PERT_LAMBDA = 4;

export interface QuantInputs {
  /** Attempts on this scenario per year. ONE quantity: how often contact happens and
   *  how often it turns into an attempt are not separable from real data, so they are
   *  derived together (see domain/frequency.ts). */
  attemptRate: Range;
  adversaryStrength: Range;    // 0..1 - share of the attacker population out-performed
  controlStrength: Range;      // 0..1 - the bar an attempt has to clear
  directImpact: Range;         // currency per loss event
  cascadingLikelihood: Range;  // 0..1 - a loss triggers follow-on loss
  cascadingImpact: Range;      // currency of the follow-on loss
}

/** One kill-chain step as the simulation sees it. The array is TOPOLOGICALLY ORDERED:
 *  `preds` are indices into the same array and always point at earlier entries. */
export interface ChainStep {
  id: string;
  preds: number[];
  /** "all" = every predecessor is required (AND), "any" = one route suffices (OR). */
  join: "all" | "any";
  /** Resistance of this step, or null when nothing defends it - an undefended step is
   *  transparent and costs no roll (that is what keeps the result independent of how
   *  finely the analyst chose to decompose the chain). */
  gate: Range | null;
  /** Probability that the attempt is spotted AND acted on here, ending the intrusion
   *  before it reaches the objective. Already includes the responders' readiness -
   *  detection nobody acts on stops nothing. Zero on terminal steps: detecting the
   *  impact itself no longer prevents the loss, it only shortens it, which is handled
   *  on the magnitude side instead. */
  interrupt: number;
  terminal: boolean;
}

export interface QuantResult {
  iterations: number;
  ale: { mean: number; min: number; max: number; p10: number; p50: number; p90: number; p99: number };
  curve: { loss: number; exceedance: number }[]; // P(annual loss >= loss)
  hist: { loss: number; p: number }[];           // distribution of positive annual losses (share per bin, LOG-spaced)
  histRange: { lo: number; hi: number };          // €-range the (log) histogram spans
  zeroShare: number;                              // fraction of years with no loss
  tef: number;                                    // mean attempts / yr
  vuln: number;                                   // Vulnerability = P(adversary > control), empirical
  lef: number;                                    // mean loss events / yr (= tef x vuln)
  /** Where attempts died: share of all attempts stopped by what the attack itself
   *  demands, before any specific measure, and the share stopped at each chain step (deepest
   *  step the attacker reached). `blockedAtBaseline + sum(breaks.p) + vuln === 1`. */
  blockedAtBaseline: number;
  breaks: { id: string; p: number }[];
  /** Share of all attempts that were stopped by being detected and responded to,
   *  rather than by resistance. Part of `breaks`, reported separately because "we caught
   *  them in the act" is a different capability from "they could not get in". */
  detected: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Seeded PRNG (mulberry32) - reproducible results for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular sample from a 3-point estimate (exact inverse-CDF). */
export function triangular(rand: () => number, r: Range): number {
  const min = r.min, max = r.max;
  if (!(max > min)) return min;
  const mode = Math.min(Math.max(r.mode, min), max);
  const c = (mode - min) / (max - min);
  const u = rand();
  return u < c
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function gaussian(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape a >= 1, scale 1) - Marsaglia-Tsang. Building block for the beta. */
function gamma(rand: () => number, a: number): number {
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = gaussian(rand); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** PERT sample from a 3-point estimate: a beta shaped by (min, mode, max, lambda),
 *  giving a smooth bell that honours the most-likely value. lambda = mode weight. */
export function pert(rand: () => number, r: Range): number {
  const min = r.min, max = r.max;
  if (!(max > min)) return min;
  const mode = Math.min(Math.max(r.mode, min), max);
  const lam = Math.max(0, r.lambda == null ? PERT_LAMBDA : r.lambda);
  const a = 1 + (lam * (mode - min)) / (max - min);
  const b = 1 + (lam * (max - mode)) / (max - min);
  const ga = gamma(rand, a), gb = gamma(rand, b);
  const x = ga / (ga + gb);           // Beta(a, b)
  return min + x * (max - min);
}

/** Poisson count (Knuth for small mean, normal approx for large). */
function poisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rand)));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

/** Run the simulation. Deterministic for a given (inputs, iterations, chain, seed).
 *  Without a `chain` the attempt is decided by the scenario baseline alone - the
 *  behaviour for taxonomies that do not model kill chains at all. */
export function simulate(inp: QuantInputs, iterations = 50000, chain?: ChainStep[], seed = 0x9e3779b9): QuantResult {
  const rand = mulberry32(seed);
  const losses = new Float64Array(iterations);
  const steps = chain?.length ? chain : null;
  const reached = steps ? new Uint8Array(steps.length) : null;   // reused per attempt
  const breakCount = steps ? new Float64Array(steps.length) : null;
  let sum = 0, zero = 0, threatTot = 0, lossTot = 0, blockedBase = 0, caughtTot = 0;
  for (let i = 0; i < iterations; i++) {
    const rate = Math.max(0, pert(rand, inp.attemptRate));
    const nThreat = poisson(rand, rate);               // attempts this year (TEF)
    threatTot += nThreat;
    let lossEvents = 0;                                // Vulnerability applied per event
    for (let k = 0; k < nThreat; k++) {
      const adv = clamp01(pert(rand, inp.adversaryStrength));
      const ctl = clamp01(pert(rand, inp.controlStrength));
      if (adv <= ctl) { blockedBase++; continue; }     // stopped before reaching any step
      if (!steps || !reached || !breakCount) { lossEvents++; continue; }
      // Walk the chain with this attacker's single capability draw.
      let deepestBlocked = -1, hit = 0, caught = 0;
      for (let s = 0; s < steps.length; s++) {
        const st = steps[s];
        let open = true;
        if (st.preds.length) {
          open = st.join === "any"
            ? st.preds.some((p) => reached[p] === 1)
            : st.preds.every((p) => reached[p] === 1);
        }
        if (open && st.gate) {
          const rs = clamp01(pert(rand, st.gate));
          if (adv <= rs) { open = false; deepestBlocked = s; }   // this control held
        }
        // Got past the barrier, but was seen doing it - and someone acted on it.
        if (open && st.interrupt > 0 && rand() < st.interrupt) { open = false; deepestBlocked = s; caught = 1; }
        reached[s] = open ? 1 : 0;
        if (open && st.terminal) hit = 1;
      }
      if (hit) lossEvents++;
      else if (deepestBlocked >= 0) { breakCount[deepestBlocked]++; caughtTot += caught; }
    }
    lossTot += lossEvents;
    let loss = 0;                                      // sum of independent per-event losses
    for (let k = 0; k < lossEvents; k++) {
      const direct = Math.max(0, pert(rand, inp.directImpact));
      const cl = clamp01(pert(rand, inp.cascadingLikelihood));
      const casc = rand() < cl ? Math.max(0, pert(rand, inp.cascadingImpact)) : 0;
      loss += direct + casc;
    }
    if (lossEvents === 0) zero++;
    losses[i] = loss;
    sum += loss;
  }
  const sorted = Float64Array.from(losses).sort();
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const ale = { mean: sum / iterations, min: sorted[0], max: sorted[sorted.length - 1], p10: pct(0.10), p50: pct(0.50), p90: pct(0.90), p99: pct(0.99) };

  const top = Math.max(ale.p99, ale.mean * 2, 1);
  const N = 48, curve: { loss: number; exceedance: number }[] = [];
  for (let k = 0; k <= N; k++) {
    const loss = (top * k) / N;
    let lo = 0, hi = sorted.length;             // first index with value >= loss
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < loss) lo = mid + 1; else hi = mid; }
    curve.push({ loss, exceedance: (sorted.length - lo) / sorted.length });
  }

  // LOG-scaled histogram of the POSITIVE annual losses (zero-loss years are reported
  // separately via zeroShare). A loss distribution is heavy-tailed, so a linear
  // axis capped at ~P99 collapses the whole right tail into the last bin; a log axis
  // over [min positive, max] shows the true long tail with no clamping artifact.
  let firstPos = 0; while (firstPos < sorted.length && sorted[firstPos] <= 0) firstPos++;
  const nPos = sorted.length - firstPos;
  const histLo = nPos > 0 ? Math.max(1, sorted[firstPos]) : 1;
  const histHi = nPos > 0 ? Math.max(sorted[sorted.length - 1], histLo * 10) : 10;
  const Llo = Math.log10(histLo), Lspan = Math.log10(histHi) - Llo || 1;
  const HB = 44, bins = new Array(HB).fill(0);
  for (let i = firstPos; i < sorted.length; i++) {
    const t = (Math.log10(sorted[i]) - Llo) / Lspan;
    bins[Math.min(HB - 1, Math.max(0, Math.floor(t * HB)))]++;
  }
  const hist = bins.map((c, k) => ({ loss: Math.pow(10, Llo + ((k + 0.5) / HB) * Lspan), p: c / iterations }));
  const tef = threatTot / iterations, lef = lossTot / iterations;
  const vuln = threatTot > 0 ? lossTot / threatTot : 0;
  const breaks = steps && breakCount && threatTot > 0
    ? steps.map((s, k) => ({ id: s.id, p: breakCount[k] / threatTot }))
    : [];
  return {
    iterations, ale, curve, hist, histRange: { lo: histLo, hi: histHi },
    zeroShare: zero / iterations, tef, vuln, lef,
    blockedAtBaseline: threatTot > 0 ? blockedBase / threatTot : 0, breaks,
    detected: threatTot > 0 ? caughtTot / threatTot : 0,
  };
}
