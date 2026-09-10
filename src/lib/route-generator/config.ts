/**
 * Business configuration of the route engine. Every threshold used by the
 * generator, the quality gate, the variant selection and the elevation
 * statistics lives here so that tuning never means hunting magic numbers.
 *
 * Distances are metres, ratios are 0..1, angles are degrees.
 */
export const ROUTE_ENGINE = {
  distance: {
    /** Target tolerance: a proposal is "on target" inside ±5 %. */
    tolerance: 0.05,
    /** Widened once when nothing fits; beyond it the result is presented as a near miss. */
    maxTolerance: 0.1,
    /** Near-miss proposals farther than this are never shown. */
    nearMissTolerance: 0.25,
    /** Damping exponent of the scale update between two routing passes. */
    refinementDamping: 0.85,
  },
  candidates: {
    /** Initial shapes (directions × strategies) when not configured. */
    defaultCount: 12,
    /** Refinement passes per candidate when not configured. */
    defaultMaxIterations: 2,
    /** Routing-call budget for one generation when not configured. */
    defaultMaxRoutingCalls: 40,
    /** Extra kept candidate beyond the number of styles (spare for similarity replacement). */
    spareKept: 1,
    /** Only this many best-fitting candidates are refined per pass. */
    refinePerPass: 5,
    /** Native round trips requested from engines that support them. */
    nativeLoops: 2,
  },
  similarity: {
    /** Two proposals sharing at least this share of their ground are never shown together. */
    maxBetweenVariants: 0.85,
    /** Grid cell used to rasterise routes when comparing them. */
    cellM: 50,
  },
  quality: {
    /** Geometry sanity. */
    minPoints: 4,
    minDistanceM: 200,
    maxJumpM: 3000,
    /** Path length must stay within this ratio of the engine distance. */
    lengthConsistency: 0.5,
    /** A loop must come back within this distance of its start. */
    loopClosureM: 250,
    /** Rejection thresholds (loops). */
    maxOutAndBackRatio: 0.35,
    maxOverlapRatio: 0.45,
    /** Rejection threshold (all modes): sharp reversals per kilometre. */
    maxUTurnsPerKm: 1.2,
    /** A loop never farther from its start than this share of its length is folded on itself. */
    minExtentRatio: 0.08,
    /** Below this way/surface compatibility the route is unsuited to the activity. */
    minActivityCompatibility: 0.2,
    /** Grid cell used for overlap / out-and-back detection. */
    cellM: 40,
    /** Window and angle used to detect U-turns. */
    uTurnWindowM: 60,
    uTurnAngle: 150,
    /** Score weights (sum = 100). */
    weights: { distance: 30, outAndBack: 22, overlap: 13, uTurns: 10, compatibility: 15, waypoints: 10 },
  },
  waypoints: {
    /** Ideal spacing between waypoints as a share of the route length (loops). */
    idealSpacingRatio: 0.25,
    /** Waypoints closer than this share of the length to each other degrade the shape. */
    minSpacingRatio: 0.08,
  },
  elevation: {
    /** Hysteresis threshold of the gain accumulator. */
    gainThresholdM: 4,
    medianWindow: 5,
    meanWindow: 3,
    /** Window of the steepest-gradient measurement. */
    gradientWindowM: 100,
  },
  duration: {
    /** Displayed durations are rounded to this many minutes. */
    roundToMinutes: 5,
  },
} as const;

/** Convenience for preliminary ranking: strong preference for exact distance. */
export const CANDIDATE_RANKING = { qualityWeight: 0.7, distanceWeight: 30, distanceSharpness: 8 } as const;
