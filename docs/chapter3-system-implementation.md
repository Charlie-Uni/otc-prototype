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
- RedemptionPressure：实现口径为前瞻性 RedemptionRequestPressure，聚合同一快照区块之前窗口期内的 RedemptionRequested 事件，除以该区块的 totalSupply；申请量与结算量分别导出。
- RedemptionQueueRatio：直接读取 FundToken 队列状态。
- LiquidityShortfall：读取链上流动性缓冲率并计算 `max(10000 - LBR, 0)`。
- StalePricingRisk：评分固定读取最新 NAV `storedAt`；同时保留从 `asOf` 和 `storedAt` 起算的两组原始陈旧秒数及 `staleReferenceUsed=storedAt`。
- InvestorConcentration：聚合 ShareBalanceUpdated 终态余额，校验余额合计等于事件 totalSupply，再以最大余数法换算份额 bps 并计算 HHI。

`/risk/submit` 只接受 `occurredAt`，不接受上述链上派生指标的请求级覆盖。通过本原型 API 提交时，风险 Oracle 不能请求级覆盖六项链上派生指标，只能触发一次可复算的链上快照生成。需要说明的是，合约层仍将 `RISK_ORACLE_ROLE` 视为受信数据提交者：绕过 API 直接发交易的授权 Oracle 可以提交合法范围内的任意六项指标。承诺哈希与审计轨迹支持事后归因和复核，不构成链上数据真实性证明（详见第 10 节边界）。

每次提交先固定 `snapshotBlockNumber` 和 `snapshotBlockTimestamp`。活动权重、NAV、估值折价、流动性、份额事件、totalSupply、赎回事件和队列比例均读取该区块；发生 `INACTIVE_WEIGHTS` 时废弃整组结果，在新区块完整重算一次。实时提交端点默认要求 `occurredAt` 不晚于快照区块且与其相差不超过 300 秒，该窗口可由服务端配置。该窗口约束受信 Oracle 输入相对快照区块的新鲜度，不定义也不限制链下 `shockAt` 到检测锚事件的 DetectionLag。

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

审计与风险响应同时保留 `staleAgeFromAsOfSec`、`staleAgeFromStoredAtSec`，敏感性导出保留 `staleAgeSecRaw`，避免归一化丢失原始信息。`maxStaleAgeSec` 与权重共同版本化上链，任何复算者都能得到同一分数。

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

R0 的 `frequencySec=604800` 表示按 Unix epoch 对齐的周期披露，而非每条状态固定延迟七天；单条状态的实际等待时间随提交时点在 0–7 天之间变化。

## 6. 权限与签名

合约使用 OpenZeppelin AccessControl，API 使用 API Key 摘要和 `timingSafeEqual` 实现角色矩阵。API 区分八类 Key：

- investor（绑定单一地址）
- manager/administrator
- registrar/subscription operator
- NAV oracle
- liquidity oracle
- risk oracle
- regulator
- auditor

链上的 `CONTROL_OPERATOR_ROLE`（Swing Pricing / Side Pocket）在 API 侧没有独立 Key：扩展控制端点由 manager Key 触发、admin 签名账户执行，属第 10 节声明的原型角色合并边界。

Visibility 是双层实现：端点 RBAC 决定谁能调用；披露引擎决定调用后可见的时间、粒度和控制信息。

投资者 API Key 额外绑定一个 EIP-55 地址，余额端点强制投资者只查询绑定地址；管理人、登记代理、监管者和审计者仍按角色矩阵访问。这提供原型范围内的横向隔离，但不替代生产身份系统。

部署脚本要求 risk oracle、liquidity oracle、regulator 与 admin 及彼此使用不同账户，并在授权后撤销 admin 对应的操作角色；admin 仍保留角色治理权限。NAV、登记和扩展控制在当前原型中仍由 admin 签名账户执行。该合并是研究原型边界，不能表述为生产级职责分离。

## 7. 审计与四时间戳

- `occurredAt`：链下业务事实发生时间；NAV 使用 asOf。
- `submittedAt`：交易所在区块时间；NAV 使用 storedAt。
- `disclosedAt`：制度和受众共同决定的首次可见时间。
- `observedAt`：API 被实际查询的时间。

事件索引幂等键为 `chainId:txHash:logIndex`。`commitmentHash = keccak(topics || data)`，用于验证索引记录对应的原始日志未被替换。数据库路径使用 `ON CONFLICT DO NOTHING`；API 审计查询采用 PostgreSQL 优先和有界 limit，CSV 导出在数据库模式下受 `AUDIT_EXPORT_MAX_ROWS`（默认 50000）约束。无数据库时使用最多 5000 条的内存缓冲，且淘汰策略优先移除最旧的匿名公共观察条目——匿名请求无法把特权操作（risk.submit、准入登记、Gate 解除等）的审计证据挤出缓冲。控制事件日志扫描按事件主题过滤，起始区块可由 `CHAIN_LOG_START_BLOCK` 配置为部署区块；披露快照查找按披露时间单调性做二分检索，公共视图查询成本为 O(log n)。

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

- Foundry 单元测试：状态机、权限、事件、配置版本、边界和 revert；含部署脚本测试（角色分离矩阵、fundId 单一来源、账户碰撞拒绝）与 fundId 错配边界固化测试。
- Foundry Fuzz：256 组合法六指标（`foundry.toml` 显式锁定 runs=256），验证评分范围和 Gate 触发不变量。
- Foundry Coverage：独立生成原始 coverage 日志，避免只引用无来源的覆盖率百分比。
- TypeScript 纯函数测试：HHI、最大余数法、流动性截断、陈旧归一化、R0-R4、RBAC、DetectionLag、敏感性、披露二分检索（含 R0 epoch 边界零等待）、INACTIVE_WEIGHTS 整批废弃重算协议、审计缓冲淘汰策略。
- 端到端 smoke：独立 Anvil、重新部署、角色签名、完整生命周期、Gate 拦截/解除、披露差异、审计同步和导出。
- PostgreSQL 集成：CI 中初始化数据库、API 重启、验证事件仍可查询。

Smoke 在压缩时间内验证链路与时间戳字段，所得生命周期滞后通常接近零，不作为制度滞后的实证结果；非零制度滞后由带外生 `shockAt` 的 DetectionLag 情景输出提供。

## 10. 明确边界

- 合约层信任授权 Oracle 的指标输入：AccessControl 证明"谁提交的"，承诺哈希证明"提交后没被换掉"，链上评分证明"计算正确"，但不单独证明"输入反映真实基金状态"。API 固定区块派生属于原型运行路径约束，不是 RiskRegistry 自身强制的数据真实性证明。
- fundId 一致性由部署配置（同一 `FUND_ID_LABEL` 派生）、部署脚本测试和端到端 Gate 测试维持；原型未实现 fundId 与各合约地址之间的中央链上登记约束，向错误 fundId 写入的状态不会被链上拒绝（fundId 错配下 Gate 不拦截该 token，已由测试固化为已知边界）。
- Swing Pricing/Side Pocket 不执行完整基金资产会计，且状态标志为单向：无链上解除函数，Side Pocket 每基金仅可创建一次。
- Gate 是全额冻结，不代表所有现实 gate 产品形态。
- Gate 未配置时拒绝赎回；自动触发、监管人工解除属于混合控制设计。
- NAV 的 `asOf` 按基金单调不回退，允许同一基准时点提交估值修正。
- 投资者 API Key 只绑定一个地址，不提供生产级用户生命周期、多地址身份或密钥轮换。
- 原始许可链日志仍可能泄露地址，承诺哈希不等同 ZK。
- 赎回压力按申请量而非结算量计算，应解释为前瞻性申请压力；实际结算量作为独立导出字段。
- 当前陈旧度评分从 storedAt 起算；asOf 与两类原始陈旧秒数同时保留。
- 控制隐藏的行为侧信道在 API 层不存在，但白名单投资者直接调用链上 `requestRedemption` 时仍可从 revert 推断 Gate 状态。
- 延迟披露制度下公共视图返回的 `notYetDisclosed` 布尔值会实时暴露"存在一笔尚未披露的提交"这一存在性信息；这是原型为可测试性保留的设计取舍，严格保密语义的部署应移除该字段。
- 公共观察审计在内存模式下受匿名优先淘汰保护；PostgreSQL 模式下匿名观察仍逐条落库且无限流，生产部署需在网关层限流。
- 估值折价与流动性缓冲为覆盖式单快照且 `occurredAt` 单调不回退（允许同时点修正），与 NAV `asOf` 口径一致。
