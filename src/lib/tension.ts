import type { Ev } from '../types';

/**
 * A simple world "tension index" from 0 to 100: how much conflict was reported in the last 24 hours, with serious
 * events counting more. It is relative and rough (volume and severity of reports, not a scientific measure).
 */
const WEIGHT = { 1: 1, 2: 3, 3: 8 } as const;
const HALF = 150; // a weighted score of 150 reads as 50/100; the curve flattens toward 100

export const tensionIndex = (evs: Ev[], to: number, hours = 24) => {
  let score = 0;
  for (const e of evs) if (e.conflict && e.ts <= to && e.ts > to - hours * 36e5) score += WEIGHT[e.severity] ?? 1;
  return Math.round((100 * score) / (score + HALF));
};

/** The index at 3-hour steps, oldest first, ending now. 17 points = the last 48 hours. */
export const tensionSeries = (evs: Ev[], now = Date.now(), points = 17, stepH = 3) =>
  Array.from({ length: points }, (_, i) => tensionIndex(evs, now - (points - 1 - i) * stepH * 36e5));

export const tensionLevel = (v: number) => (v < 30 ? 'Calm' : v < 55 ? 'Elevated' : v < 75 ? 'High' : 'Severe');
export const tensionColor = (v: number) => (v < 30 ? '#32d74b' : v < 55 ? '#ffd60a' : v < 75 ? '#ff9f0a' : '#ff453a');
