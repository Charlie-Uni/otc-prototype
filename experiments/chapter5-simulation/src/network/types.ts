export const RISK_TIERS = ['low', 'medium', 'high'] as const;

export type RiskTier = (typeof RISK_TIERS)[number];

export type FundNode = {
  id: string;
  initialAum: number;
  initialTotalShares: number;
  liquidityMismatchTier: RiskTier;
  stalePricingTier: RiskTier;
  concentrationTier: RiskTier;
  expectedRedemptionClaimsBps: number;
  liquidAssetShareBps: number;
  liquidityBufferRatioBps: number;
  navUpdateIntervalDays: number;
  investorConcentrationBps: number;
};

export type InvestorNode = {
  id: string;
};

export type AssetClassNode = {
  id: string;
  liquidity: 'liquid' | 'illiquid';
};

export type InstitutionNode = {
  id: string;
};

export type FundInvestorHolding = {
  fundId: string;
  investorId: string;
  shareBps: number;
};

export type FundAssetExposure = {
  fundId: string;
  assetClassId: string;
  exposureBps: number;
};

export type FundInstitutionRelation = {
  fundId: string;
  institutionId: string;
};

export type NetworkModel = {
  schemaVersion: 1;
  networkSeed: number;
  funds: FundNode[];
  investors: InvestorNode[];
  assetClasses: AssetClassNode[];
  managers: InstitutionNode[];
  serviceProviders: InstitutionNode[];
  valuationMethods: InstitutionNode[];
  holdings: FundInvestorHolding[];
  assetExposures: FundAssetExposure[];
  managerRelations: FundInstitutionRelation[];
  serviceProviderRelations: FundInstitutionRelation[];
  valuationMethodRelations: FundInstitutionRelation[];
  sharedInvestorCoreIds: string[];
};

export type NetworkSummary = {
  holdingEdgeCount: number;
  assetExposureEdgeCount: number;
  activeInvestorCount: number;
  overlappingInvestorCount: number;
};

export type NetworkProximityComponents = {
  sharedIlliquidAssetBps: number;
  investorOverlapBps: number;
  commonServiceOrManagerBps: number;
  valuationMethodSimilarityBps: number;
};

export type NetworkTransmissionChannels = {
  sharedIlliquidAssets: boolean;
  investorOverlap: boolean;
  signalAnalogy: boolean;
};

export const NETWORK_PROPAGATION_SOURCE_KINDS = [
  'asset_sale',
  'redemption_pressure',
  'public_risk',
  'public_control',
] as const;

export type NetworkPropagationSourceKind = typeof NETWORK_PROPAGATION_SOURCE_KINDS[number];

export type NetworkSignalSource = {
  sourceId: string;
  kind: Exclude<NetworkPropagationSourceKind, 'asset_sale'>;
  sourceFundId: string;
  tick: number;
  availableAt: number;
  magnitudeBps: number;
};

export type NetworkPropagationRecord = {
  propagationId: string;
  replicateId: number;
  sourceKind: NetworkPropagationSourceKind;
  sourceId: string;
  sourceFundId: string;
  targetFundId: string;
  tick: number;
  sourceAt: number;
  propagatedAt: number;
  rawComponents: NetworkProximityComponents;
  effectiveComponents: NetworkProximityComponents;
  proximityWeightsBps: readonly [number, number, number, number];
  networkProximityBps: number;
  transmissionProximityBps: number;
  sourceMagnitudeBps: number;
  transmissionBps: number;
  spilloverRedemptionBps: number;
  transmittedLoss: number;
  assetClassId: string | null;
  targetAssetValueBefore: number | null;
  targetAssetValueAfter: number | null;
};
