import { createHash } from 'node:crypto';
import { deterministicShuffle } from '../core/rng';
import type { TransparencyRegimeId } from '../artifact/risk/regimes';
import type { FormalExperimentDesign, TreatmentValue } from './design';

export type FormalCell = {
  cellId: string;
  family: 'primary_policy' | 'ablation' | 'robustness' | 'behavior_lhs';
  pairId: string;
  arm: 'baseline' | 'comparison' | 'shock' | 'no_shock';
  regimeId: TransparencyRegimeId;
  shockType: 'valuation' | 'liquidity' | 'redemption';
  shockMagnitudeBps: number;
  shockEnabled: boolean;
  replicates: number;
  treatmentChanges: Array<{ path: string; value: TreatmentValue }>;
  hypothesisIds: string[];
};

export type FormalExperimentMatrix = {
  schemaVersion: 1;
  designDigestSha256: string;
  cellCount: number;
  cells: FormalCell[];
};

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function primaryCells(design: FormalExperimentDesign): FormalCell[] {
  return design.primaryPolicy.regimeIds.flatMap((regimeId) => (
    design.primaryPolicy.valuationShockBps.flatMap((shockMagnitudeBps) => {
      const pairId = `POLICY-${regimeId}-${shockMagnitudeBps}`;
      const common = {
        family: 'primary_policy' as const,
        pairId,
        regimeId,
        shockType: 'valuation' as const,
        shockMagnitudeBps,
        replicates: design.formalReplicates,
        treatmentChanges: [],
        hypothesisIds: ['H1', 'H2', 'H3'],
      };
      return [
        {
          ...common,
          cellId: `${pairId}-SHOCK`,
          arm: 'shock' as const,
          shockEnabled: true,
        },
        {
          ...common,
          cellId: `${pairId}-NO-SHOCK`,
          arm: 'no_shock' as const,
          shockEnabled: false,
        },
      ];
    })
  ));
}

function ablationCells(design: FormalExperimentDesign): FormalCell[] {
  return design.ablations.flatMap((ablation) => {
    const common = {
      family: 'ablation' as const,
      pairId: ablation.id,
      regimeId: ablation.regimeId,
      shockType: 'valuation' as const,
      shockMagnitudeBps: 2_000,
      shockEnabled: true,
      replicates: design.formalReplicates,
      hypothesisIds: [...ablation.hypothesisIds],
    };
    return [
      {
        ...common,
        cellId: `${ablation.id}-BASELINE`,
        arm: 'baseline' as const,
        treatmentChanges: [
          ...ablation.fixedChanges,
          { path: ablation.changedPath, value: ablation.baselineValue },
        ],
      },
      {
        ...common,
        cellId: `${ablation.id}-COMPARISON`,
        arm: 'comparison' as const,
        treatmentChanges: [
          ...ablation.fixedChanges,
          { path: ablation.changedPath, value: ablation.comparisonValue },
        ],
      },
    ];
  });
}

function robustnessCells(design: FormalExperimentDesign): FormalCell[] {
  return design.robustnessScans.flatMap((scan) => {
    const baseline = scan.values.find(({ id }) => id === scan.baselineValueId)!;
    return scan.values.filter(({ id }) => id !== scan.baselineValueId).flatMap((comparison) => {
      const pairId = `ROBUST-${scan.id}-${comparison.id}`;
      const shockType = scan.id === 'SHOCK_TYPE'
        ? comparison.value as FormalCell['shockType']
        : 'valuation';
      const common = {
        family: 'robustness' as const,
        pairId,
        regimeId: 'R1' as const,
        shockMagnitudeBps: 2_000,
        shockEnabled: true,
        replicates: scan.replicates,
        hypothesisIds: ['H1', 'H2', 'H4', 'H5', 'H6'],
      };
      return [
        {
          ...common,
          cellId: `${pairId}-BASELINE`,
          arm: 'baseline' as const,
          shockType: 'valuation' as const,
          treatmentChanges: [
            ...scan.fixedChanges,
            { path: scan.changedPath, value: baseline.value },
          ],
        },
        {
          ...common,
          cellId: `${pairId}-COMPARISON`,
          arm: 'comparison' as const,
          shockType,
          treatmentChanges: [
            ...scan.fixedChanges,
            { path: scan.changedPath, value: comparison.value },
          ],
        },
      ];
    });
  });
}

function behaviorLhsCells(design: FormalExperimentDesign): FormalCell[] {
  const fields = Object.keys(design.behaviorLhs.ranges).sort();
  const valuesByField = new Map(fields.map((field) => {
    const [lower, upper] = design.behaviorLhs.ranges[field]!;
    const strata = deterministicShuffle(
      Array.from({ length: design.behaviorLhs.sampleCount }, (_, index) => index),
      {
        masterSeed: BigInt(design.behaviorLhs.seed),
        replicateId: 0,
        entityId: field,
        moduleId: 'formal-behavior-lhs',
        tick: 0,
        drawPurpose: 'strata-permutation',
      },
    );
    return [field, strata.map((stratum) => (
      lower + ((stratum + 0.5) / design.behaviorLhs.sampleCount) * (upper - lower)
    ))] as const;
  }));
  return Array.from({ length: design.behaviorLhs.sampleCount }, (_, index) => {
    const pairId = `BEHAVIOR-LHS-${String(index + 1).padStart(2, '0')}`;
    const common = {
      family: 'behavior_lhs' as const,
      pairId,
      regimeId: 'R1' as const,
      shockType: 'valuation' as const,
      shockMagnitudeBps: 2_000,
      shockEnabled: true,
      replicates: design.behaviorLhs.replicates,
      hypothesisIds: ['H2'],
    };
    return [
      {
        ...common,
        cellId: `${pairId}-BASELINE`,
        arm: 'baseline' as const,
        treatmentChanges: [],
      },
      {
        ...common,
        cellId: `${pairId}-COMPARISON`,
        arm: 'comparison' as const,
        treatmentChanges: fields.map((field) => ({
          path: `config.behavior.coefficients.${field}`,
          value: valuesByField.get(field)![index]!,
        })),
      },
    ];
  }).flat();
}

export function generateFormalExperimentMatrix(
  design: FormalExperimentDesign,
): FormalExperimentMatrix {
  const cells = [
    ...primaryCells(design),
    ...ablationCells(design),
    ...robustnessCells(design),
    ...behaviorLhsCells(design),
  ];
  const ids = cells.map(({ cellId }) => cellId);
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_FORMAL_CELL_ID');
  return {
    schemaVersion: 1,
    designDigestSha256: digest(design),
    cellCount: cells.length,
    cells,
  };
}
