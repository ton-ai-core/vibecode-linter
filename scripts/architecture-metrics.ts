// CHANGE: Rewrite architecture metrics using Effect for pure functional computations
// WHY: Use existing Effect abstractions instead of reinventing the wheel
// FORMAT THEOREM: ∀ metrics: computeQualityScore(metrics) ∈ Effect<number>
// PURITY: CORE (pure calculations with Effect)
// INVARIANT: All scores ∈ [0, 1]
// COMPLEXITY: O(1)

import { Effect } from "effect";

export interface ArchitecturalMetrics {
	readonly corePurityScore: number;
	readonly shellEffectIsolation: number;
	readonly typeSafetyCoverage: number;
	readonly monadicConsistency: number;
	readonly testMathematicalRigor: number;
}

export interface QualityGate {
	readonly minScore: number;
	readonly requiredMetrics: readonly (keyof ArchitecturalMetrics)[];
}

export const QUALITY_GATES = {
	production: {
		minScore: 0.95,
		requiredMetrics: [
			"corePurityScore",
			"shellEffectIsolation",
			"typeSafetyCoverage",
			"monadicConsistency",
			"testMathematicalRigor",
		] as const,
	},
	development: {
		minScore: 0.85,
		requiredMetrics: ["corePurityScore", "typeSafetyCoverage"] as const,
	},
	prototype: {
		minScore: 0.7,
		requiredMetrics: ["corePurityScore"] as const,
	},
} as const;

/**
 * Вычисляет общий балл качества архитектуры с использованием Effect
 *
 * @complexity O(1)
 */
export const computeQualityScore = (
	metrics: ArchitecturalMetrics,
): Effect.Effect<number> =>
	Effect.sync(() => {
		const values = [
			metrics.corePurityScore,
			metrics.shellEffectIsolation,
			metrics.typeSafetyCoverage,
			metrics.monadicConsistency,
			metrics.testMathematicalRigor,
		];
		return values.reduce((sum, val) => sum + val, 0) / values.length;
	});

/**
 * Проверяет соответствие quality gate с использованием Effect
 *
 * @complexity O(m) where m = |gate.requiredMetrics|
 */
export const checkQualityGate = (
	metrics: ArchitecturalMetrics,
	gate: QualityGate,
): Effect.Effect<boolean> =>
	Effect.sync(() => {
		for (const metric of gate.requiredMetrics) {
			if (metrics[metric] < gate.minScore) {
				return false;
			}
		}
		return true;
	});

/**
 * Вычисляет взвешенный балл с учетом приоритетов метрик
 *
 * @complexity O(n) where n = |metrics|
 */
export const computeWeightedScore = (
	metrics: ArchitecturalMetrics,
	weights: ArchitecturalMetrics,
): Effect.Effect<number> =>
	Effect.sync(() => {
		return (
			metrics.corePurityScore * weights.corePurityScore +
			metrics.shellEffectIsolation * weights.shellEffectIsolation +
			metrics.typeSafetyCoverage * weights.typeSafetyCoverage +
			metrics.monadicConsistency * weights.monadicConsistency +
			metrics.testMathematicalRigor * weights.testMathematicalRigor
		);
	});

/**
 * Форматирует метрики в читаемый отчет
 *
 * @complexity O(1)
 */
export const formatMetricsReport = (
	metrics: ArchitecturalMetrics,
): Effect.Effect<string> =>
	Effect.sync(() => {
		const toPercent = (n: number): string => `${(n * 100).toFixed(1)}%`;

		return `Architectural Quality Report:
  - Core Purity: ${toPercent(metrics.corePurityScore)}
  - Shell Effect Isolation: ${toPercent(metrics.shellEffectIsolation)}
  - Type Safety Coverage: ${toPercent(metrics.typeSafetyCoverage)}
  - Monadic Consistency: ${toPercent(metrics.monadicConsistency)}
  - Test Mathematical Rigor: ${toPercent(metrics.testMathematicalRigor)}

Overall Quality Score: ${toPercent(
			Effect.runSync(computeQualityScore(metrics)),
		)}`;
	});

/**
 * Анализирует метрики и возвращает рекомендации по улучшению
 *
 * @complexity O(m) where m = |targetGate.requiredMetrics|
 */
export const getImprovementRecommendations = (
	metrics: ArchitecturalMetrics,
	targetGate: QualityGate,
): Effect.Effect<readonly string[]> =>
	Effect.sync(() => {
		const recommendations: string[] = [];

		for (const metric of targetGate.requiredMetrics) {
			const currentScore = metrics[metric];
			const requiredScore = targetGate.minScore;

			if (currentScore < requiredScore) {
				const gap = ((requiredScore - currentScore) * 100).toFixed(1);
				const metricName = formatMetricName(metric);

				recommendations.push(
					`${metricName}: improve by ${gap}% (current: ${(currentScore * 100).toFixed(1)}%, required: ${(requiredScore * 100).toFixed(1)}%)`,
				);
			}
		}

		return recommendations;
	});

const formatMetricName = (metric: keyof ArchitecturalMetrics): string => {
	const names: Record<keyof ArchitecturalMetrics, string> = {
		corePurityScore: "Core Purity Score",
		shellEffectIsolation: "Shell Effect Isolation",
		typeSafetyCoverage: "Type Safety Coverage",
		monadicConsistency: "Monadic Consistency",
		testMathematicalRigor: "Test Mathematical Rigor",
	};
	return names[metric];
};
