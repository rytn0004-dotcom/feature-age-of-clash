/**
 * Summarizes the bounded F3 samples collected during one browser stress scenario.
 * Window durations weight FPS and instantaneous renderer counters; estimated frame counts
 * weight frame/simulation/render means. P95 is interpolated from each window's P95 value,
 * while hitch and CPU maxima are the worst window observed in the capture.
 */
export function aggregateBattleStressSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new RangeError("At least one F3 performance sample is required.");
  }

  const durations = samples.map((sample, index) => {
    const current = Number(sample.elapsedSeconds);
    const previous = index === 0 ? 0 : Number(samples[index - 1].elapsedSeconds);
    const delta = current - previous;
    return Number.isFinite(delta) && delta > 0 ? delta : 0;
  });
  const hasDurations = durations.some((duration) => duration > 0);
  const timeWeights = hasDurations ? durations : samples.map(() => 1);
  const frameWeights = samples.map((sample, index) => {
    const fps = Number(sample.fps);
    const estimatedFrames = fps * timeWeights[index];
    return Number.isFinite(estimatedFrames) && estimatedFrames > 0
      ? estimatedFrames
      : timeWeights[index];
  });

  const weightedAverage = (key, weights) => {
    let weightedTotal = 0;
    let totalWeight = 0;
    samples.forEach((sample, index) => {
      const value = Number(sample[key]);
      const weight = weights[index];
      if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) return;
      weightedTotal += value * weight;
      totalWeight += weight;
    });
    return totalWeight > 0 ? weightedTotal / totalWeight : Number.NaN;
  };

  const maximum = (key) => {
    const values = samples.map((sample) => Number(sample[key])).filter(Number.isFinite);
    return values.length > 0 ? Math.max(...values) : Number.NaN;
  };

  const percentile = (key, quantile) => {
    const values = samples
      .map((sample) => Number(sample[key]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (values.length === 0) return Number.NaN;
    if (values.length === 1) return values[0];
    const position = (values.length - 1) * quantile;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const fraction = position - lower;
    return values[lower] + (values[upper] - values[lower]) * fraction;
  };

  const latest = samples[samples.length - 1];
  return {
    samples: samples.length,
    fps: weightedAverage("fps", timeWeights),
    frameAverageMs: weightedAverage("frameAverageMs", frameWeights),
    p95Ms: percentile("frameP95Ms", 0.95),
    hitchMs: maximum("maxHitchMs"),
    simulationAverageMs: weightedAverage("simulationUpdateAverageMs", frameWeights),
    simulationMaxMs: maximum("simulationUpdateMaxMs"),
    unitUpdateAverageMs: weightedAverage("unitUpdateAverageMs", frameWeights),
    fieldSiegeAverageMs: weightedAverage("fieldSiegeAverageMs", frameWeights),
    unitCollisionAverageMs: weightedAverage("unitCollisionAverageMs", frameWeights),
    buildingCollisionAverageMs: weightedAverage("buildingCollisionAverageMs", frameWeights),
    resourceCollisionAverageMs: weightedAverage("resourceCollisionAverageMs", frameWeights),
    unitVisualSyncAverageMs: weightedAverage("unitVisualSyncAverageMs", frameWeights),
    simulationOtherAverageMs: weightedAverage("simulationOtherAverageMs", frameWeights),
    renderAverageMs: weightedAverage("renderCallAverageMs", frameWeights),
    renderMaxMs: maximum("renderCallMaxMs"),
    aiDecisionLastMs: Number(latest.aiDecisionLastMs),
    aiDecisionAverageMs: Number(latest.aiDecisionAverageMs),
    aiDecisionMaxMs: Number(latest.aiDecisionMaxMs),
    aiDecisionSamples: Number(latest.aiDecisionTimingSamples),
    aiHeartbeat: Number(latest.aiDecisionCount),
    aStarSearches: Number(latest.pathSearchSamples),
    aStarAiSearches: Number(latest.aiPathSearchSamples),
    aStarEmptyPaths: Number(latest.emptyPathSearches),
    aStarAverageMs: Number(latest.pathSearchAverageMs),
    aStarMaxMs: Number(latest.pathSearchMaxMs),
    drawCalls: Math.round(weightedAverage("drawCalls", timeWeights)),
    drawCallsMax: maximum("drawCalls"),
    triangles: Math.round(weightedAverage("triangles", timeWeights)),
    trianglesMax: maximum("triangles"),
    renderer: String(latest.rendererMode || "unknown"),
  };
}
