export type ReviewRating = "again" | "hard" | "good" | "easy"

export function scheduleReview(
    current: { reviewInterval: number; reviewEase: number; reviewCount: number },
    rating: ReviewRating,
    now = new Date(),
) {
    const ease = Math.max(1.3, Math.min(3, current.reviewEase + ({ again: -0.2, hard: -0.15, good: 0, easy: 0.15 })[rating]))
    const interval = rating === "again" ? 0 : current.reviewInterval === 0
        ? ({ hard: 1, good: 1, easy: 4 })[rating]
        : Math.max(1, Math.round(current.reviewInterval * ease * ({ hard: 0.6, good: 1, easy: 1.3 })[rating]))
    const reviewDueAt = new Date(now.getTime() + (rating === "again" ? 10 * 60_000 : interval * 24 * 60 * 60_000))
    return { reviewInterval: interval, reviewEase: ease, reviewCount: current.reviewCount + 1, reviewDueAt }
}
