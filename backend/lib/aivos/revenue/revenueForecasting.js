/**
 * Revenue Forecasting – projects future revenue using time-series extrapolation.
 *
 * Methods:
 *   linear     – OLS regression on historical data points
 *   moving_avg – N-period simple moving average
 *   growth_rate – compound growth rate extrapolation
 */
export function createRevenueForecasting(deps = {}) {
  const dataPoints = []; // { period, value, ts }

  /** Record a revenue data point for a period (e.g. 'week-2024-01'). */
  function record(period, value) {
    dataPoints.push({ period, value, ts: new Date().toISOString() });
  }

  /**
   * Forecast N future periods.
   * @param {{ periods?, method? }} opts
   * @returns {{ forecasts: {period, value}[], method, confidence }}
   */
  function forecast({ periods = 4, method = 'linear' } = {}) {
    if (dataPoints.length < 2) return { forecasts: [], method, confidence: 0 };

    const values = dataPoints.map((d) => d.value);
    const n = values.length;

    let slope = 0, intercept = 0;

    if (method === 'linear') {
      const xMean = (n - 1) / 2;
      const yMean = values.reduce((s, v) => s + v, 0) / n;
      const num = values.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0);
      const den = values.reduce((s, _, i) => s + Math.pow(i - xMean, 2), 0);
      slope = den !== 0 ? num / den : 0;
      intercept = yMean - slope * xMean;
    }

    const avg = values.slice(-Math.min(4, n)).reduce((s, v) => s + v, 0) / Math.min(4, n);
    const lastVal = values[n - 1];
    const growthRate = n >= 2 ? Math.pow(lastVal / Math.max(1, values[0]), 1 / (n - 1)) : 1.05;

    const forecasts = [];
    for (let i = 1; i <= periods; i++) {
      let value;
      if (method === 'linear')      value = intercept + slope * (n - 1 + i);
      else if (method === 'moving_avg') value = avg;
      else value = lastVal * Math.pow(growthRate, i); // growth_rate
      forecasts.push({ period: `forecast+${i}`, value: Math.max(0, value) });
    }

    const r2 = _r2(values, slope, intercept);
    return { forecasts, method, confidence: Math.max(0, Math.min(1, r2)) };
  }

  function _r2(values, slope, intercept) {
    const n = values.length;
    const yMean = values.reduce((s, v) => s + v, 0) / n;
    const ssTot = values.reduce((s, v) => s + Math.pow(v - yMean, 2), 0);
    const ssRes = values.reduce((s, v, i) => s + Math.pow(v - (intercept + slope * i), 2), 0);
    return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  }

  function history() { return [...dataPoints]; }

  return { record, forecast, history };
}

export default createRevenueForecasting;
