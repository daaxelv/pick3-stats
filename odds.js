// NJ Pick 3 Odds Calculator
//
// Pure math — no historical data, no crowd modeling, no predictions.
// These are the fixed, provable odds of NJ Pick 3, unaffected by past draws:
//   - Straight (exact order):        1 in 1,000
//   - 6-way box (3 unique digits):   1 in 166.67  (6 winning orders out of 1,000)
//   - 3-way box (one repeated digit, i.e. a "double"): 1 in 333.33 (3 winning orders)
//   - Triple (e.g. 777): box play doesn't apply — straight is the only option, 1 in 1,000
//
// This module is intentionally dependency-free so it can run both in the
// browser (attaches to window.OddsCalculator) and under Node's test runner.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.OddsCalculator = mod;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TOTAL_COMBOS = 1000; // 000-999

  /**
   * Classify a 3-digit combo by digit structure.
   * @param {string} combo - 3 digits, e.g. "123", "112", "777"
   * @returns {'unique'|'double'|'triple'}
   */
  function classifyCombo(combo) {
    const digits = String(combo).trim();
    if (!/^\d{3}$/.test(digits)) {
      throw new Error('classifyCombo expects a 3-digit string, got: ' + combo);
    }
    const uniqueDigits = new Set(digits.split(''));
    if (uniqueDigits.size === 3) return 'unique';
    if (uniqueDigits.size === 2) return 'double';
    return 'triple';
  }

  /**
   * Number of winning digit-orders ("ways") for a box play of this combo.
   * unique digits -> 6 permutations, one repeated digit -> 3 permutations,
   * triple -> 1 (box play is not a distinct option from straight).
   */
  function waysForCombo(combo) {
    const cat = classifyCombo(combo);
    return cat === 'unique' ? 6 : cat === 'double' ? 3 : 1;
  }

  function toOddsResult(numerator) {
    const probability = numerator / TOTAL_COMBOS;
    return {
      numerator,
      denominator: TOTAL_COMBOS,
      probability,
      // "1 in N" framing, rounded to 2 decimals for display
      oneIn: Math.round((TOTAL_COMBOS / numerator) * 100) / 100,
      percent: Math.round(probability * 100 * 10000) / 10000,
    };
  }

  /** Straight-bet odds: always 1 in 1,000, regardless of combo structure. */
  function straightOdds() {
    return toOddsResult(1);
  }

  /**
   * Box-bet odds for a given combo. Returns null for triples, since NJ
   * Pick 3 box play is not offered as a separate bet type for triples
   * (straight is the only option there) — this is not a fabricated
   * restriction, it mirrors the actual game rules.
   */
  function boxOdds(combo) {
    const cat = classifyCombo(combo);
    if (cat === 'triple') return null;
    return toOddsResult(waysForCombo(combo));
  }

  /**
   * Cost-vs-coverage for playing multiple distinct straight combos.
   * Each additional distinct combo linearly increases the exact-match
   * chance because each occupies one of the 1,000 equally likely outcomes.
   * @param {number} numCombos - number of distinct combos played (1-1000)
   * @param {number} costPerCombo - cost per combo in dollars (default $1)
   */
  function multiComboCoverage(numCombos, costPerCombo = 1) {
    if (!Number.isInteger(numCombos) || numCombos < 1 || numCombos > TOTAL_COMBOS) {
      throw new Error('numCombos must be an integer between 1 and ' + TOTAL_COMBOS);
    }
    const odds = toOddsResult(numCombos);
    return {
      numCombos,
      totalCost: Math.round(numCombos * costPerCombo * 100) / 100,
      exactMatchProbability: odds.probability,
      exactMatchOneIn: odds.oneIn,
      exactMatchPercent: odds.percent,
    };
  }

  // --- NJ PICK 4 ---
  // Straight (exact order):                        1 in 10,000
  // 24-way box (4 unique digits):                   1 in 416.67
  // 12-way box (one pair + two other unique digits): 1 in 833.33
  // 6-way box (two pairs):                           1 in 1,666.67
  // 4-way box (three of one digit + one other):      1 in 2,500
  // "1-way" (all four digits the same, e.g. 1111): box play doesn't apply,
  // straight is the only option, 1 in 10,000 — mirrors the triple case above.
  const TOTAL_COMBOS_P4 = 10000; // 0000-9999

  /**
   * Classify a 4-digit combo by digit structure.
   * @param {string} combo - 4 digits, e.g. "1234", "1123", "1122", "1112", "1111"
   * @returns {'unique'|'oneDouble'|'twoPair'|'triple'|'quad'}
   */
  function classifyCombo4(combo) {
    const digits = String(combo).trim();
    if (!/^\d{4}$/.test(digits)) {
      throw new Error('classifyCombo4 expects a 4-digit string, got: ' + combo);
    }
    const counts = {};
    for (const d of digits) counts[d] = (counts[d] || 0) + 1;
    const tally = Object.values(counts).sort((a, b) => b - a);
    if (tally.length === 4) return 'unique';       // e.g. 1234 - all distinct
    if (tally.length === 3) return 'oneDouble';    // e.g. 1123 - one pair
    if (tally.length === 2 && tally[0] === 2) return 'twoPair'; // e.g. 1122
    if (tally.length === 2 && tally[0] === 3) return 'triple';  // e.g. 1112
    return 'quad'; // e.g. 1111
  }

  /**
   * Number of winning digit-orders ("ways") for a Pick 4 box play.
   */
  function waysForCombo4(combo) {
    const cat = classifyCombo4(combo);
    if (cat === 'unique') return 24;
    if (cat === 'oneDouble') return 12;
    if (cat === 'twoPair') return 6;
    if (cat === 'triple') return 4;
    return 1; // quad
  }

  function toOddsResultP4(numerator) {
    const probability = numerator / TOTAL_COMBOS_P4;
    return {
      numerator,
      denominator: TOTAL_COMBOS_P4,
      probability,
      oneIn: Math.round((TOTAL_COMBOS_P4 / numerator) * 100) / 100,
      percent: Math.round(probability * 100 * 10000) / 10000,
    };
  }

  /** Pick 4 straight-bet odds: always 1 in 10,000, regardless of combo structure. */
  function straightOddsP4() {
    return toOddsResultP4(1);
  }

  /**
   * Pick 4 box-bet odds for a given combo. Returns null for quads (e.g.
   * 1111), since box play is not a distinct option there — straight is
   * the only option, matching the actual game rules.
   */
  function boxOddsP4(combo) {
    const cat = classifyCombo4(combo);
    if (cat === 'quad') return null;
    return toOddsResultP4(waysForCombo4(combo));
  }

  /**
   * Cost-vs-coverage for playing multiple distinct Pick 4 straight combos.
   * @param {number} numCombos - number of distinct combos played (1-10000)
   * @param {number} costPerCombo - cost per combo in dollars (default $1)
   */
  function multiComboCoverageP4(numCombos, costPerCombo = 1) {
    if (!Number.isInteger(numCombos) || numCombos < 1 || numCombos > TOTAL_COMBOS_P4) {
      throw new Error('numCombos must be an integer between 1 and ' + TOTAL_COMBOS_P4);
    }
    const odds = toOddsResultP4(numCombos);
    return {
      numCombos,
      totalCost: Math.round(numCombos * costPerCombo * 100) / 100,
      exactMatchProbability: odds.probability,
      exactMatchOneIn: odds.oneIn,
      exactMatchPercent: odds.percent,
    };
  }

  return {
    TOTAL_COMBOS,
    classifyCombo,
    waysForCombo,
    straightOdds,
    boxOdds,
    multiComboCoverage,
    TOTAL_COMBOS_P4,
    classifyCombo4,
    waysForCombo4,
    straightOddsP4,
    boxOddsP4,
    multiComboCoverageP4,
  };
});
