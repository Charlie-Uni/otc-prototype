# 第 3 章系统实现与方法说明

## 1. 实现范围

原型以第 3 章提出的生命周期可观测系统为边界，落实四个层次：

1. 生命周期业务状态和事件。
2. 风险指标、评分与控制。
3. R0-R4 透明度参数包与角色访问。
4. 四时间戳审计、承诺哈希与仿真导出。

简单且核心的金融流程使用最小状态机；会显著扩张资产会计范围的控制机制使用“事件 + 状态标志 + 触发依据 + 承诺哈希”。该边界与导师确认的“不做过度复杂系统”一致。

## 2. 论文事件映射

| 论文事件 | 实现位置 | 实现深度 |
| --- | --- | --- |
| InvestorWhitelisted | FundToken | 白名单状态、VC 承诺哈希、事件、mint 前强制校验 |
| SubscriptionRequested | FundToken | 请求状态机、请求承诺、授权确认后 mint |
| ShareBalanceUpdated | FundToken | mint、burn、transfer 后统一发出绝对余额和 totalSupply |
| NAVUpdatedEvent | NAVRegistry | fundId 隔离、历史记录、asOf/storedAt、payloadHash |
| ValuationHaircutEvent | NAVRegistry | 独立 Oracle 状态，供风险评分读取 |
| StalePricingWarning | RiskRegistry | 归一化陈旧风险达到 10000 时自动触发 |
| LiquidityBufferUpdated | RiskRegistry | 流动性 Oracle 独立提交与承诺 |
| RedemptionRequested | FundToken | 请求状态机和可用份额锁定 |
| RedemptionQueueUpdated | FundToken | 队列金额、供给和比例同步更新 |
| RedemptionSettled | FundToken | 按请求结算和 burn |
| SettlementDelayed | FundToken | 原因哈希与状态标志 |
| GateTriggered/Released | RiskRegistry | score > kappa 自动触发；监管角色凭原因哈希解除 |
| SwingPricingApplied | RiskRegistry | 状态、调整 bps、规则 ID、触发评分、承诺 |
| SidePocketCreated | RiskRegistry | 状态、资产承诺、规则 ID、触发评分、承诺 |

## 3. 六项风险指标

链上 `RiskMetrics` 固定顺序为：

1. `valuationHaircutBps`
2. `redemptionPressureBps`
3. `redemptionQueueRatioBps`
4. `liquidityShortfallBps`
5. `stalePricingRiskBps`
6. `investorConcentrationBps`

### 3.1 指标来源

- ValuationHaircut：读取 NAVRegistry 最新估值折价快照。
- RedemptionPressure：聚合窗口期 RedemptionRequested 事件，除以当前 totalSupply。
- RedemptionQueueRatio：直接读取 FundToken 队列状态。
- LiquidityShortfall：读取链上流动性缓冲率并计算 `max(10000 - LBR, 0)`。
- StalePricingRisk：读取最新 NAV `storedAt`，同时保留原始陈旧秒数。
- InvestorConcentration：聚合 ShareBalanceUpdated 终态余额，校验余额合计等于事件 totalSupply，再以最大余数法换算份额 bps 并计算 HHI。

`/risk/submit` 只接受 `occurredAt`，不接受上述链上派生指标的请求级覆盖。这样风险 Oracle 只能触发一次可复算的链上快照生成，不能绕过认购、登记、NAV 或赎回状态直接填指标。

### 3.2 归一化与定点数

Solidity 不使用浮点。比例统一采用 basis points：

```text
10000 = 100%
```

陈旧定价原始值是秒，与其他 `[0,1]` 指标量纲不同，因此评分使用：

```text
stalePricingRiskBps =
  min(floor(staleAgeSec * 10000 / maxStaleAgeSec), 10000)
```

审计与敏感性导出同时保留 `staleAgeSecRaw`，避免归一化丢失原始信息。`maxStaleAgeSec` 与权重共同版本化上链，任何复算者都能得到同一分数。

### 3.3 权重和评分

默认权重采用近似等权：

```text
[1667, 1667, 1667, 1667, 1666, 1666]
```

合约强制 `sum(weightBps) = 10000`，用于定义归一化加权平均并保证评分仍在 `0..10000`。评分由 RiskRegistry 根据已存指标和指定的活动权重版本计算，Oracle 不能直接填入 score。历史配置按 `weightsConfigId` 保留。

旧权重 `[2000,2000,2000,2000,1000,1000]` 仅作为稳健性对照。7/14/30/45 天 `MaxStaleAge`、两组权重与 `kappa in {5000,6000,7000,8000}` 形成 32 个敏感性组合。

部署脚本从环境变量读取六项权重、`MaxStaleAge` 和 κ；缺省值仅是研究基线。参数进入合约后仍由 `RiskRegistry` 校验并版本化，API 不持有用于评分的权重副本。

## 4. 检测、展示与干预

三类阈值语义分离：

- yellow/red：展示层分档，基线为 4000/6000。
- `tau`：实验中“已检测”的原始评分阈值，情景基线为 6000。
- `kappa`：链上控制阈值，默认 7000，且仅在 `score > kappa` 时触发 Gate。

上述数值均为可配置实验基线，不是论文规定或监管标准。稳健性分析系统扫描 `kappa in {5000,6000,7000,8000}`；仿真检测只读取原始 `riskScoreBps`，不以 gated 状态或展示层 riskLevel 反推检测，避免循环定义。

## 5. R0-R4 透明度参数包

透明度制度统一表达为：

```text
f(Frequency, Visibility, Granularity, Delay, ControlDisclosure)
```

| 制度 | Frequency | Visibility | Granularity | Delay | ControlDisclosure |
| --- | ---: | --- | --- | ---: | --- |
| R0 | 7 days | public | aggregate | 0 | delayed |
| R1 | realtime | public | detailed | 0 | public |
| R2 | realtime | role_based | aggregate | 0 | private |
| R3 | realtime | public | detailed | 1 day | delayed |
| R4 | realtime | tiered | tiered | 0 | tiered |

制度由服务端默认配置控制；仅开启实验开关时允许 `?regime=` 切换。`visibility=public` 时监管端也受相同披露时间边界约束，因此 R3 监管者不能绕过一天延迟。未到披露时间返回 `unknown`，不把“无可见数据”误报为低风险。

R4 控制事件在 gated、原始评分为 red，或事件为 GateReleased 时披露。实时视图和审计时间线复用同一判断函数，避免制度语义分叉。

## 6. 权限与签名

合约使用 OpenZeppelin AccessControl，API 使用 API Key 摘要和 `timingSafeEqual` 实现角色矩阵。API 区分：

- manager/administrator
- registrar/subscription operator
- NAV oracle
- liquidity oracle
- risk oracle
- control operator
- regulator
- auditor

Visibility 是双层实现：端点 RBAC 决定谁能调用；披露引擎决定调用后可见的时间、粒度和控制信息。

链上签名层已将 risk oracle、liquidity oracle 和 regulator 与 admin 分离；NAV、登记和扩展控制在当前原型中仍由 admin 签名账户执行。该合并是研究原型边界，不能表述为生产级职责分离。

## 7. 审计与四时间戳

- `occurredAt`：链下业务事实发生时间；NAV 使用 asOf。
- `submittedAt`：交易所在区块时间；NAV 使用 storedAt。
- `disclosedAt`：制度和受众共同决定的首次可见时间。
- `observedAt`：API 被实际查询的时间。

事件索引幂等键为 `chainId:txHash:logIndex`。`commitmentHash = keccak(topics || data)`，用于验证索引记录对应的原始日志未被替换。数据库路径使用 `ON CONFLICT DO NOTHING`；无数据库时使用内存 Map。

## 8. DetectionLag 方法

冲击真值保存在链下 scenario JSON，不发链上事件。锚事件定义为冲击后首个 `riskScoreBps >= tau` 的 RiskMetricsSubmitted。

系统同时导出三类滞后：

```text
SystemDetectionLag = anchor.submittedAt - shockAt
DisclosureDetectionLag(regime, audience) = firstDisclosedAt - shockAt
ObservationDetectionLag = firstPollingObservationAt - shockAt
```

永不披露的制度-受众组合标记为 `censored`，不填入巨大数值。ObservationDetectionLag 使用情景中显式轮询间隔，因此结果可复现。

## 9. 测试方法

- Foundry 单元测试：状态机、权限、事件、配置版本、边界和 revert。
- Foundry Fuzz：256 组合法六指标，验证评分范围和 Gate 触发不变量。
- Foundry Coverage：独立生成原始 coverage 日志，避免只引用无来源的覆盖率百分比。
- TypeScript 纯函数测试：HHI、最大余数法、流动性截断、陈旧归一化、R0-R4、RBAC、DetectionLag、敏感性。
- 端到端 smoke：独立 Anvil、重新部署、角色签名、完整生命周期、Gate 拦截/解除、披露差异、审计同步和导出。
- PostgreSQL 集成：CI 中初始化数据库、API 重启、验证事件仍可查询。

## 10. 明确边界

- Swing Pricing/Side Pocket 不执行完整基金资产会计。
- Gate 是全额冻结，不代表所有现实 gate 产品形态。
- 自动触发、监管人工解除属于混合控制设计。
- NAV 的 `asOf` 按基金单调不回退，允许同一基准时点提交估值修正。
- API Key 只证明角色，不提供投资者身份级横向隔离。
- 原始许可链日志仍可能泄露地址，承诺哈希不等同 ZK。
- 赎回压力按申请量而非结算量计算，论文应把它表述为前瞻压力代理变量。
- 当前陈旧度从 storedAt 起算；asOf 仍作为 occurredAt 保留，最终论文需明确该选择。
