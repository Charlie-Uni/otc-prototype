# 第 3 章系统测试矩阵

## 测试目标

本测试体系验证第 3 章研究原型的可实现性与可观测性，不把原型结果表述为生产环境性能、安全性或监管合规认证。统一入口为：

```bash
pnpm test:chapter3
```

测试证据默认写入 `test-results/chapter3/<UTC timestamp>/`，其中 `summary.json` 为机器可读总表。

## 3.7 评价维度

| 评价维度 | 当前状态 | 实现与测试依据 | 保留边界 |
| --- | --- | --- | --- |
| 事件完整性 | PASS | 准入、现金认购/份额确认、份额登记、NAV、估值折价、陈旧定价、流动性、赎回现金结算和控制事件均有 Solidity 测试及索引 smoke | Swing Pricing 与 Side Pocket 只实现状态、触发依据和承诺，不模拟完整基金会计 |
| 指标生成能力 | PASS | 固定区块读取、NAV 公式/NAVAdjustment、链上估值折价/流动性输入、原始来源年龄、六项指标顺序、归一化、HHI、申请压力、队列比例、SubscriptionFlow、SettlementDelay 与链上加权评分测试 | RedemptionPressure 明确实现为前瞻性申请压力；认购流入与结算时延只进入审计/仿真，不改变六项评分 |
| 角色可见性 | PASS | API Key RBAC 401/403、投资者 Key 地址绑定、R0-R4 visibility/granularity/controlDisclosure 测试 | 地址绑定不等同生产级用户生命周期或多地址身份系统 |
| 四类时间戳 | PASS | occurred/submitted/disclosed/observed 映射、CSV/JSON 导出、三类 DetectionLag 测试 | observedAt 取决于实验声明的轮询频率 |
| 隐私保护 | PARTIAL | 受保护端点、聚合披露、VC 承诺哈希 | 许可链原始日志仍含地址；ZK 与生产身份系统不在原型范围 |
| 仿真映射 | PASS | 链下 shockAt、同基金且冲击后的原始评分锚事件、制度-受众披露滞后、公开档位可识别性、轮询观察滞后和删失值测试 | 聚合/分层公开视图不能识别任意精确阈值；第 5、6 章可分别选择三类 lag |
| 可编程控制 | PASS | score > kappa 自动 Gate、监管解除、Swing Pricing/SidePocket 状态与规则承诺、未配置 fail-closed、Gate 拦截新增和存量赎回测试 | Gate 为全额冻结；扩展控制不执行完整资产会计 |
| 可审计轨迹 | PASS | 事件幂等索引、commitmentHash、篡改复算不一致测试、API 审计、CSV 导出、有界查询、重复同步 0 插入、PostgreSQL 重启后事件与 DetectionLag 一致性 | 生命周期内存索引仅用于短期演示且不淘汰；5000 条上限只适用于 API 访问审计缓冲；最终 CI 使用 PostgreSQL 16 |

## 测试分层

| 层级 | 方法与技术 | 主要验证内容 | 证据文件 |
| --- | --- | --- | --- |
| 合约单元、Fuzz、不变量与覆盖率 | Foundry、Solidity、256 组 Fuzz、128×64 状态序列、forge coverage | 权限、现金-份额-NAV 公式、认购/赎回状态机、基金化 NAV、NAVAdjustment、Oracle 状态、评分、阈值、Gate、扩展控制、赎回队列，以及余额/队列/供应量跨操作一致性 | `contracts.log`、`coverage.log` |
| API 单元 | Node test runner、TypeScript、纯函数测试 | 指标计算、SubscriptionFlow、SettlementDelay、receipt 快照确认、来源年龄状态、固定快照时间、启动绑定、最大余数法、制度引擎、RBAC/资源授权、错误映射、控制事件时间、DetectionLag、敏感性 | `api-tests.tap` |
| 静态检查 | TypeScript strict mode、ShellCheck、Slither | 类型边界、ABI 调用、路由组合、Shell 脚本质量和 Solidity 常见缺陷扫描 | `typecheck.log`、`shellcheck.log`、`slither.json`、`slither.log` |
| 端到端 | Anvil、Foundry Script、Cast、Fastify、curl | 部署角色分离、fundId/NAV 绑定、准入、现金认购、公式 NAV、赎回现金结算、评分、风险/陈旧警告、Gate、扩展控制、披露、审计 | `role-separation.log`、`fund-binding.log`、`smoke.log` |
| 描述性链上成本 | `forge snapshot`、交易 receipt `gasUsed` | 版本间 gas diff，以及完整生命周期状态下核心写操作的实际 gas | `gas-snapshot.txt`、`gas-snapshot.log`、`smoke-gas.csv` |
| 持久化集成 | PostgreSQL、API 重启验证 | 建表、upsert、重启后事件和 API 审计仍可读取，同一 DetectionLag 情景前后输出一致 | `postgres-persistence.json`、`postgres-audit-persistence.json`、`detection-before-restart.json`、`detection-after-restart.json` |

## 健壮性测试组

该组整理既有测试并补充承诺篡改检测，不引入 RPC 自动恢复或交易恢复业务：

- 重复事件同步：相同 `chainId:txHash:logIndex` 二次同步插入数为 0。
- PostgreSQL 恢复：API 真实重启后仍可读取生命周期事件和 API 审计，并对同一输入复现相同 DetectionLag。
- 权重换代竞争：`INACTIVE_WEIGHTS` 时废弃整组快照，在新固定区块读取活动配置后完整重算一次。
- 基金绑定失败：`fundId` 或 NAVRegistry 地址错配时 API 启动失败。
- 审计缓冲压力：匿名观察不能优先淘汰特权操作证据。
- 承诺篡改检测：原始日志 topic 或 data 变化后，`keccak(topics || data)` 复算值与原承诺不一致。该测试证明可发现不一致，不主张链上自动拒绝篡改日志。

## 当前验证快照

- Foundry：88 项合约测试通过（83 项单元/Fuzz 加 5 项状态不变量）；四组 Fuzz 各运行 256 组输入，五项 invariant 各运行 128 轮、每轮深度 64，即每项 8192 次有界 Handler 调用（`foundry.toml` 显式锁定）。
- API：v1.4.0 基线的 99 项 Node/TypeScript 测试通过。新增覆盖 SubscriptionFlow、SettlementDelay、共享闭区间窗口、receipt 多日志精确确认以及 PostgreSQL/内存存储分离；payload v3 golden hash 保持不变。
- 静态检查：TypeScript `--noEmit` 与 ShellCheck 通过；Slither 扫描 20 个合约、101 个 detector，第二轮 21 项结果已在 `docs/chapter3-static-analysis.md` 中逐项分级，未将静态分析表述为生产安全审计。
- 端到端：初始 NAV、现金认购换份额、净资产计算 NAV、赎回现金金额、链上指标溯源、高风险评分、30 天陈旧警告、Gate、R0-R4、基金绑定错配拒绝启动、审计与仿真全部通过。
- 合约行覆盖率仅以 `contracts/src/` 三份生产合约为分母，测试 Handler 不进入覆盖率数字；运行时字节数以 `summary.json` 为准，三份业务合约均低于 EIP-170 的 24576 B。部署脚本另由 `Deploy.t.sol` 与端到端 smoke 验证，不计入业务合约覆盖率报表。
- gas 证据只描述当前编译器、合约版本和 smoke 状态序列下的链上写入成本，不作为吞吐量、响应延迟或生产规模评价。
- 固定摘要见 `docs/evidence/chapter3-summary.json`；其证据来源 commit 与 GitHub Actions run id 以该文件的 `source` 字段为准（避免本文档与重锚定后的证据产生引用漂移）。当前摘要已锚定到最终 master 的 CI 运行（Node 22、PostgreSQL 16），包含因果观察时钟与静态分析结果，并附同一提交的无 `.env` 干净源码副本独立复现记录；本地未配置 PostgreSQL，持久化路径由 master CI 独立验证。
- Smoke 是压缩时间的功能验证，生命周期 CSV 中接近零的原始时间差不作为制度效果证据；三类 DetectionLag 均以 `/audit/detection-lags` 的情景输出为准。
- 当前生产合约分支覆盖率为 82.25%（139/169）。未覆盖分支同时包含不可达防御条件和可达但低价值的异常路径，不能统一表述为“全部不可达”；逐版本以原始 `coverage.log` 为准，行覆盖率与分支覆盖率分别报告。
- Invariant Handler 的随机操作集覆盖认购、转让、赎回、NAV、风险提交与 Gate，不随机执行 Swing Pricing/Side Pocket；扩展控制由确定性单元测试覆盖。

## 时间戳口径

- `occurredAt`：链下业务事实发生时间；`NAVUpdatedEvent` 使用 `asOf`。实验冲击真值另存于链下 scenario 的 `shockAt`，不混入业务事件流。
- `submittedAt`：状态写入链上的时间；`NAVUpdatedEvent` 使用 `storedAt`。
- `disclosedAt`：R0-R4 制度与受众共同决定的可见时间。
- `observedAt`：投资者、监管者或审计者实际调用 API 的时间；在模拟链时间推进或分布式时钟偏差下，以最新链上区块和被观察记录的时间为因果下界，禁止出现负观察滞后。
- `GateTriggered.occurredAt`：继承风险冲击的发生时间，而不是 Gate 交易执行时间；执行时间记录在 `submittedAt`。

## DetectionLag 口径

- 锚事件：`shockAt` 之后首个原始 `riskScoreBps >= tau` 的 `RiskMetricsSubmitted`。
- `SystemDetectionLag = anchor.submittedAt - shockAt`。
- `DisclosureDetectionLag(regime, audience) = firstDisclosedAt - shockAt`。
- `ObservationDetectionLag = firstPollingObservationAt - shockAt`。
- 永不披露的制度-受众组合标记为 `censored`，不使用空值或人为大数。
- API 的 300 秒窗口只约束实时 Oracle 输入相对快照区块的新鲜度，不构成 `shockAt` 到检测锚事件的滞后上限。

展示层阈值、检测阈值 `tau` 与控制阈值 `kappa` 分离。检测锚只读取原始评分，不读取 `riskLevel` 或 `gated`，避免控制状态反向制造“已检测”的循环定义。
