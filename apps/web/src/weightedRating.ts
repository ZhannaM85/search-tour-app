/**
 * Bayesian (IMDb-style) average: pull raw ratings toward a prior mean when
 * vote counts are low.
 *
 *   weighted = (v / (v + m)) * R + (m / (v + m)) * C
 *
 * R = hotel rating, v = vote count, C = prior mean, m = prior strength.
 */

export type RatingPrior = {
  /** Typical rating to shrink toward (C). */
  mean: number;
  /** How many “imaginary” votes the prior is worth (m). */
  strength: number;
};

const FALLBACK_MEAN = 8.5;
const MIN_STRENGTH = 150;
const MAX_STRENGTH = 400;

/** Build a prior from the current shortlist (or sensible defaults). */
export function ratingPriorFromHotels(
  hotels: ReadonlyArray<{
    rating: number | null;
    reviewCount: number | null;
  }>,
): RatingPrior {
  const rated = hotels.filter(
    (h) => h.rating != null && Number.isFinite(h.rating) && h.rating > 0,
  );
  const mean =
    rated.length > 0
      ? rated.reduce((sum, h) => sum + (h.rating as number), 0) / rated.length
      : FALLBACK_MEAN;

  const votes = rated
    .map((h) => h.reviewCount)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const median = votes.length ? votes[Math.floor(votes.length / 2)] : 250;
  const strength = Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, median));

  return { mean, strength };
}

/** Bayesian-weighted rating, or null when no raw rating. */
export function weightedRating(
  rating: number | null,
  reviewCount: number | null,
  prior: RatingPrior,
): number | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  const v =
    reviewCount != null && Number.isFinite(reviewCount) && reviewCount > 0
      ? reviewCount
      : 0;
  const { mean: C, strength: m } = prior;
  return (v / (v + m)) * rating + (m / (v + m)) * C;
}

export function formatWeightedRating(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
