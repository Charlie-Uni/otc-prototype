# 第 3 章系统实现与方法说明

## 1. 实现范围

原型以第 3 章提出的生命周期可观测系统为边界，落实四个层次：

1. 生命周期业务状态和事件。
2. 风险指标、评分与控制。
3. R0-R4 透明度参数包与角色访问。
4. 四时间戳审计、承诺哈希与仿真导出。

简单且核心的金融流程使用最小状态机；会显著扩张资产会计范围的控制机制使用“事件 + 状态标志 + 触发依据 + 承诺哈希”。

## 2. 论文事件映射

| 论文事件 | 实现位置 | 实现深度 |
| --- | --- | --- |
| InvestorWhitelisted | FundToken | 白名单状态、VC 承诺哈希、事件、mint 前强制校验 |
| SubscriptionRequested/Accepted | FundToken | 现金认购请求、请求承诺、按确认时 NAV 计算并 mint 份额 |
| ShareBalanceUpdated | FundToken | mint、burn、transfer 后统一发出绝对余额和 totalSupply |
| NAVUpdatedEvent | NAVRegistry | 首期发行 NAV 引导；后续按净资产/份额计算，保留输入、fundId、asOf/storedAt 和 payloadHash |
| ValuationHaircutEvent | NAVRegistry | 独立 Oracle 状态，供风险评分读取 |
| StalePricingWarning | RiskRegistry | 归一化陈旧风险达到 10000 时自动触发 |
| LiquidityBufferUpdated | RiskRegistry | 流动性 Oracle 独立提交与承诺 |
| RedemptionRequested | FundToken | 请求状态机和可用份额锁定 |
| RedemptionQueueUpdated | FundToken | 队列金额、供给和比例同步更新 |
| RedemptionSettled | FundToken | 按结算时 NAV 计算现金金额、记录 NAV 快照并 burn 份额 |
| SettlementDelayed | FundToken | 原因哈希与状态标志 |
| GateTriggered/Released | RiskRegistry | score > kappa 自动触发；监管角色凭原因哈希解除 |
| SwingPricingApplied | RiskRegistry | 状态、调整 bps、规则 ID、触发评分、承诺 |
| SidePocketCreated | RiskRegistry | 状态、资产承诺、规则 ID、触发评分、承诺 |

表 3-2 中不进入六项主评分的 `SubscriptionFlow` 和 `SettlementDelay` 由审计索引派生：前者在同一闭区间窗口内分别汇总申请金额、接受金额和铸造份额；后者按 requestId 关联申请、延迟标记与最终结算，输出 `settledAt - requestedAt`。两者仅进入 `/audit/simulation` 和独立审计查询端点，不进入 `/risk/submit`、payload v3 或链上评分。

表 3-3 的零知识资格证明未作为本原型已实现能力。当前实现是白名单、VC 承诺哈希和角色访问控制；真正的 ZK eligibility proof 属于生产隐私层的扩展方向。

### 2.1 认购、NAV 与赎回公式

金额与份额使用整数定点数，NAV 精度为 `1e18`：

```text
MintedShares = floor(SubscriptionAmount * 1e18 / SubscriptionNAV)
NAV = floor(NetAssetValue * 1e18 / TotalSharesSnapshot)
RedemptionAmount = floor(RedeemedShares * SettlementNAV / 1e18)
```

基金成立前不存在可作为分母的份额，因而 `postInitialNAV` 只允许写入第一条发行 NAV。完成首批认购后，普通 `postNAV` 不再接受调用方直接填写 NAV，而是由合约根据 `netAssetValue` 和固定区块读取的 `totalSharesSnapshot` 计算。认购接受和赎回结算分别记录所用 NAV、NAV 的 `asOf`、现金金额和份额数量，使金额-份额换算可审计。

该原型只计算和记录现金金额，不转移稳定币、不实现托管现金账户或完整基金总账。由此验证的是论文公式和状态可观测性，而不是交收资产本身。

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
- RedemptionPressure：实现口径为前瞻性 RedemptionRequestPressure，聚合同一快照区块之前窗口期内的 RedemptionRequested 事件，除以该区块的 totalSupply；申请量与结算量分别导出。论文中的结算口径 `sum(RedeemedShares) / TotalShares` 不被删除，系统通过 `settledAmount` 和 SettlementDelay 记录并行保留已实现结算事实。
- RedemptionQueueRatio：直接读取 FundToken 队列状态。
- LiquidityShortfall：读取链上流动性缓冲率并计算 `max(10000 - LBR, 0)`。
- StalePricingRisk：评分固定读取最新 NAV `storedAt`；同时保留从 `asOf` 和 `storedAt` 起算的两组原始陈旧秒数及 `staleReferenceUsed=storedAt`。
- InvestorConcentration：聚合 ShareBalanceUpdated 终态余额，校验余额合计等于事件 totalSupply，再以最大余数法换算份额 bps 并计算 HHI。

`/risk/submit` 只接受 `occurredAt`，不接受上述链上派生指标的请求级覆盖。通过本原型 API 提交时，风险 Oracle 不能请求级覆盖六项链上派生指标，只能触发一次可复算的链上快照生成。需要说明的是，合约层仍将 `RISK_ORACLE_ROLE` 视为受信数据提交者：绕过 API 直接发交易的授权 Oracle 可以提交合法范围内的任意六项指标。承诺哈希与审计轨迹支持事后归因和复核，不构成链上数据真实性证明（详见第 10 节边界）。

该约束由 API 架构保证，不是 `RiskRegistry.submitMetrics` 对指标来源的链上证明。持有 `RISK_ORACLE_ROLE` 的账户若绕过 API 直接调用合约，仍可提交六项指标；合约会使用活动权重自行计算评分、校验指标范围并自动执行阈值规则，但信任授权 Oracle 对指标来源负责。这是原型的明确 Oracle 信任边界。

每次提交先固定 `snapshotBlockNumber` 和 `snapshotBlockTimestamp`。活动权重、NAV、估值折价、流动性、份额事件、totalSupply、赎回事件和队列比例均读取该区块；发生 `INACTIVE_WEIGHTS` 时废弃整组结果，在新区块完整重算一次。交易确认从当前 receipt 中按 RiskRegistry 地址、fundId 和 payloadHash 精确定位 `RiskMetricsSubmitted.snapshotId`，再调用 `snapshotAt` 校验，避免并发提交时误读另一笔交易的 latest 快照。实时提交端点默认要求 `occurredAt` 不晚于快照区块且与其相差不超过 300 秒，该窗口可由服务端配置。该窗口约束受信 Oracle 输入相对快照区块的新鲜度，不定义也不限制链下 `shockAt` 到检测锚事件的 DetectionLag。

估值折价与流动性缓冲均保留来源事件的 `occurredAt`、`submittedAt`、`payloadHash` 和相对风险快照的原始 `ageSec`。若服务端未配置来源最大年龄，状态标记为 `trusted_latest_unbounded`；若配置，则仅产生 `fresh` 或 `stale_warning`。该机制不拒绝交易，也不改变六项评分，避免在论文未规定陈旧 SLA 的情况下擅自引入新的评分规则。

风险提交承诺使用版本化 ABI 编码。当前 schema v3 将 `chainId`、RiskRegistry 地址、`fundId`、固定快照区块、来源事件承诺、六项指标和权重配置共同编码后取 `keccak256`，避免同一 payload 在不同链、合约或基金之间被无意复用。

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

R4 的三层含义分别为：角色层由 public/regulator 受众边界实现；风险状态层在 gated 或原始评分进入 red 时提高控制可见性；信息类型层把精确六指标、风险档位和控制事件分开处理。R4 风险视图只公开 `riskScoreBand`，控制事件在 gated、原始评分为 red，或事件为 GateReleased 时披露。实时视图和审计时间线复用同一判断函数，避免制度语义分叉。

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

Visibility 是双层实现：端点 RBAC 决定谁能调用；披露引擎决定调用后可见的时间、粒度和控制信息。监管者可读取当前控制状态；审计者读取生命周期时间线和控制日志，不拥有 `/controls/state` 的实时操作视图。

投资者 API Key 额外绑定一个 EIP-55 地址，余额端点强制投资者只查询绑定地址；管理人、登记代理、监管者和审计者仍按角色矩阵访问。这提供原型范围内的横向隔离，但不替代生产身份系统。

部署脚本要求 risk oracle、liquidity oracle、regulator 与 admin 及彼此使用不同账户，并在授权后撤销 admin 对应的操作角色；admin 仍保留角色治理权限。NAV、登记和扩展控制在当前原型中仍由 admin 签名账户执行。该合并是研究原型边界，不能表述为生产级职责分离。

当前部署是单基金实例，不引入中心化 FundRegistry。`FundToken.fundId` 和 `FundToken.navRegistry` 均为 immutable，部署脚本从同一 `FUND_ID_LABEL` 配置合约；API 启动时读取链上绑定并与本地 `FUND_ID_LABEL`、`NAV_REGISTRY_ADDRESS` 比较，不一致立即退出。该方案证明单部署实例的一致性，但不是任意多基金地址关系的链上注册证明；多基金应分别部署实例，或在扩展架构中增加正式 FundRegistry。

## 7. 审计与四时间戳

- `occurredAt`：链下业务事实发生时间；NAV 使用 asOf。
- `submittedAt`：交易所在区块时间；NAV 使用 storedAt。
- `disclosedAt`：制度和受众共同决定的首次可见时间。
- `observedAt`：API 被实际查询的时间。为避免 Anvil 时间推进或分布式时钟微小偏差造成“先观察、后上链”的因果倒置，API 以最新链上区块时间和被观察记录时间作为下界进行归一化；正常运行时仍等于实际访问时间。

事件索引幂等键为 `chainId:txHash:logIndex`。`commitmentHash = keccak(topics || data)`，用于验证索引记录对应的原始日志未被替换；测试通过分别修改 topic 和 data，确认复算摘要与原承诺不一致。该能力支持事后发现和归因，不等同链上自动拒绝被修改的链下索引记录。数据库路径使用 `ON CONFLICT DO NOTHING`，且成功落库后不再复制到生命周期内存 Map；timeline、DetectionLag、simulation 和 CSV 均通过同一 DB-first 读取函数。无数据库模式保留完整生命周期内存 Map，不做会破坏时间线完整性的事件淘汰，仅定位为短期演示。

API 访问审计是另一套存储：查询采用 PostgreSQL 优先和有界 limit，CSV 导出在数据库模式下受 `AUDIT_EXPORT_MAX_ROWS`（默认 50000）约束；无数据库时使用最多 5000 条的有界缓冲，并优先移除最旧的匿名公共观察条目，避免匿名请求把特权操作证据挤出缓冲。控制事件日志扫描按事件主题过滤，起始区块可由 `CHAIN_LOG_START_BLOCK` 配置为部署区块；披露快照查找按披露时间单调性做二分检索，公共视图查询成本为 O(log n)。

## 8. DetectionLag 方法

冲击真值保存在链下 scenario JSON，不发链上事件。情景必须指定 `fundId`；锚事件定义为同一基金、冲击发生后首个 `riskScoreBps >= tau` 的 RiskMetricsSubmitted，冲击前提交或其他基金事件不会进入分析。

系统同时导出三类滞后：

```text
SystemDetectionLag = anchor.submittedAt - shockAt
DisclosureDetectionLag(regime, audience) = firstDisclosedAt - shockAt
ObservationDetectionLag = firstPollingObservationAt - shockAt
```

永不披露的制度-受众组合标记为 `censored`，不填入巨大数值。ObservationDetectionLag 使用情景中显式轮询间隔，因此结果可复现。

监管者使用原始评分判断任意 `tau`。投资者仅在 detailed 制度下拥有同等信息；aggregate/tiered 制度只公开 yellow/red 档位，因此只有与公开档位边界相同的阈值可被识别。对不可由公开信息识别的任意阈值，导出 `censored=true` 和 `censorReason=threshold_not_identifiable`，不假装投资者观察到了未披露的精确评分。

## 9. 测试方法

- Foundry 单元测试：状态机、权限、事件、配置版本、边界和 revert；含部署脚本测试（角色分离矩阵、fundId 单一来源、账户碰撞拒绝）与 fundId 错配边界固化测试。
- Foundry Fuzz：六指标评分、净资产/NAV、现金认购/份额和份额/赎回金额四组性质测试，每组运行 256 个随机输入（`foundry.toml` 显式锁定 runs=256）。
- Foundry Invariant：四个有界投资者和十类合法 Handler 操作组成随机生命周期序列；每项运行 128 轮、每轮深度 64，验证持仓/总供应量、队列/锁定份额、认购 mint/赎回 burn、NAV 公式、评分范围和 Gate 转移等跨操作不变量。随机 Handler 不覆盖 Swing Pricing 和 Side Pocket 的完整会计交互；这两类扩展控制由单元测试验证状态、权限、触发依据与承诺。
- Foundry Coverage：独立生成原始 coverage 日志，分母只包含 `contracts/src/` 生产合约，避免测试 Handler 稀释业务覆盖率。
- TypeScript 纯函数测试：HHI、最大余数法、流动性截断、陈旧归一化、SubscriptionFlow、SettlementDelay、R0-R4、RBAC、DetectionLag、敏感性、receipt 精确确认、披露二分检索（含 R0 epoch 边界零等待）、INACTIVE_WEIGHTS 整批废弃重算协议、审计缓冲淘汰策略、来源新鲜度评估、基金绑定校验和事件承诺篡改检测。
- 端到端 smoke：独立 Anvil、顺序广播重新部署、角色签名、基金绑定启动校验（含错配拒绝启动）、现金/份额/NAV 公式、完整生命周期、风险与陈旧警告、Gate 拦截/解除、披露差异、审计同步和导出。
- 描述性 gas 证据：`.gas-snapshot` 用于版本 diff；smoke 根据 API 返回的交易哈希读取 receipt `gasUsed`，记录完整状态序列下认购、赎回、NAV、风险和控制操作成本。该数据不构成吞吐量或生产性能主张。
- PostgreSQL 集成：CI 中初始化数据库、API 重启，验证事件、API 审计和同一情景的 DetectionLag 结果保持可读且一致。

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
- 零知识资格证明属于扩展方向；本原型不得把白名单、VC 哈希或 payload commitment 表述为 ZK proof。
- 赎回压力按申请量而非结算量计算，应解释为前瞻性申请压力；实际结算量作为独立导出字段。
- 当前陈旧度评分从 storedAt 起算；asOf 与两类原始陈旧秒数同时保留。
- 估值折价和流动性来源默认采用“受信 Oracle 最新状态”假设；可配置年龄只产生警告，不构成论文未规定的硬拒绝规则。
- `RISK_ORACLE_ROLE` 绕过 API 直接提交指标属于受信 Oracle 边界；链上强制的是范围、评分复算、配置版本和控制规则，不是每个指标来源的密码学证明。
- `netAssetValue` 由受信 NAV Oracle 提交，API 在固定区块读取 FundToken `totalSupply` 后一并送入 NAVRegistry；合约强制执行除法公式并留存输入，但直接持有 `MANAGER_ROLE` 的账户仍对这两个输入负责。
- 单基金实例通过 immutable 绑定和 API 启动校验保证一致性，不等同全局 FundRegistry。
- 控制隐藏的行为侧信道在 API 层不存在，但白名单投资者直接调用链上 `requestRedemption` 时仍可从 revert 推断 Gate 状态。
- 延迟披露制度下公共视图返回的 `notYetDisclosed` 布尔值会实时暴露"存在一笔尚未披露的提交"这一存在性信息；这是原型为可测试性保留的设计取舍，严格保密语义的部署应移除该字段。
- 公共观察审计在内存模式下受匿名优先淘汰保护；PostgreSQL 模式下匿名观察仍逐条落库且无限流，生产部署需在网关层限流。
- 估值折价与流动性缓冲为覆盖式单快照且 `occurredAt` 单调不回退（允许同时点修正），与 NAV `asOf` 口径一致。
- 赎回结算金额向下取整后若为 0（`REDEMPTION_TOO_SMALL`），该笔请求将持续留在队列中：原型不提供请求取消流程，需等待 NAV 上行后重试结算。
- 初始发行 NAV 记录的 `netAssetValue` 与 `totalSharesSnapshot` 为 0，消费方必须依据 `isInitial` 标志区分一次性发行定价与公式计算 NAV；API 层已按此处理。
- 审计索引假设许可链已提供稳定最终性；原型未实现确认区块深度、链重组检测或从共同祖先回滚重放。生产部署应在达到配置确认数后再固化索引，并在检测到重组时撤销孤块记录后重新同步。
- 无数据库模式的生命周期事件 Map 不设淘汰上限，以保持短期演示中的完整事件轨迹；长时间运行必须启用 PostgreSQL。
- `RiskWarningEvent` 与 Gate 当前共用链上 `kappa` 条件，预警和干预在合约原型中同时发生；独立预警阈值属于后续扩展，实验检测阈值 `tau` 仍在仿真层独立定义。
- R0-R4是系统已经实现并测试的固定透明度参数包；公开API不接受任意五维制度组合。后续机制剥离若需扩展组合，应由独立实验runner复用同一参数语义生成。