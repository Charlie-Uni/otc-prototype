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
| 事件完整性 | PASS | 准入、认购申请/确认、份额登记、NAV、估值折价、陈旧定价、流动性、赎回、结算和控制事件均有 Solidity 测试及索引 smoke | Swing Pricing 与 Side Pocket 只实现状态、触发依据和承诺，不模拟完整基金会计 |
| 指标生成能力 | PASS | 固定区块读取、NAVAdjustment、链上估值折价/流动性输入、六项指标顺序、归一化、HHI、申请压力、队列比例、链上加权评分测试 | RedemptionPressure 明确实现为前瞻性申请压力；结算量独立导出 |
| 角色可见性 | PASS | API Key RBAC 401/403、投资者 Key 地址绑定、R0-R4 visibility/granularity/controlDisclosure 测试 | 地址绑定不等同生产级用户生命周期或多地址身份系统 |
| 四类时间戳 | PASS | occurred/submitted/disclosed/observed 映射、CSV/JSON 导出、三类 DetectionLag 测试 | observedAt 取决于实验声明的轮询频率 |
| 隐私保护 | PARTIAL | 受保护端点、聚合披露、VC 承诺哈希 | 许可链原始日志仍含地址；ZK 与生产身份系统不在原型范围 |
| 仿真映射 | PASS | 链下 shockAt、原始评分锚事件、制度-受众披露滞后、轮询观察滞后和删失值测试 | 第 5、6 章可分别选择三类 lag，不把三者混为一个指标 |
| 可编程控制 | PASS | score > kappa 自动 Gate、监管解除、Swing Pricing/SidePocket 状态与规则承诺、未配置 fail-closed、Gate 拦截新增和存量赎回测试 | Gate 为全额冻结；扩展控制不执行完整资产会计 |
| 可审计轨迹 | PASS | 事件幂等索引、commitmentHash、API 审计、CSV 导出、有界查询、重复同步 0 插入、PostgreSQL 重启后读取 | 默认本地模式为最多 5000 条内存缓冲；最终 CI 使用 PostgreSQL 16 验证持久化路径 |

## 测试分层

| 层级 | 方法与技术 | 主要验证内容 | 证据文件 |
| --- | --- | --- | --- |
| 合约单元、Fuzz 与覆盖率 | Foundry、Solidity、256 组 Fuzz、forge coverage | 权限、认购状态机、基金化 NAV、NAVAdjustment、Oracle 状态、评分不变量、阈值、Gate、扩展控制、赎回队列、事件 | `contracts.log`、`coverage.log` |
| API 单元 | Node test runner、TypeScript、纯函数测试 | 指标计算、固定快照时间、最大余数法、制度引擎、RBAC/资源授权、错误映射、控制事件时间、DetectionLag、敏感性 | `api-tests.tap` |
| 静态检查 | TypeScript strict mode | 类型边界、ABI 调用和路由组合 | `typecheck.log` |
| 端到端 | Anvil、Foundry Script、Cast、Fastify、curl | 部署角色分离、准入、认购、登记、NAV、估值/流动性 Oracle、赎回、评分、Gate、扩展控制、披露、审计 | `role-separation.log`、`smoke.log` |
| 持久化集成 | PostgreSQL、API 重启验证 | 建表、upsert、重启后事件和 API 审计仍可读取 | `postgres-persistence.json`、`postgres-audit-persistence.json` |

## 当前验证快照

- Foundry：71 项合约测试通过（含部署脚本角色分离测试与 fundId 错配边界测试），其中 Fuzz 每次运行 256 组输入（`foundry.toml` 显式锁定）。
- API：75 项 Node/TypeScript 测试通过（含披露二分检索、INACTIVE_WEIGHTS 重试协议、审计缓冲淘汰策略）。
- 静态检查：TypeScript `--noEmit` 通过。
- 端到端：独立部署、链上指标溯源、7702 bps 高风险评分、Gate、R0-R4、审计与仿真全部通过。
- 合约行覆盖率：FundToken 98.37%、NAVRegistry 100%、RiskRegistry 97.30%、总计 98.10%；原始输出由统一测试入口生成到 `coverage.log`。部署脚本另由 `Deploy.t.sol` 与端到端 smoke 验证，不计入业务合约覆盖率报表。
- 运行时代码：FundToken、NAVRegistry、RiskRegistry 均低于 EIP-170 的 24576 B，具体字节数以 `summary.json` 为准。
- 固定摘要见 `docs/evidence/chapter3-summary.json`；其证据来源 commit 与 GitHub Actions run id 以该文件的 `source` 字段为准（避免本文档与重锚定后的证据产生引用漂移）。对应 CI 运行启用 PostgreSQL 16，并在 API 进程重启后验证 `GateTriggered` 事件和 `risk.submit` 审计记录仍可读取；完整原始日志保存在对应 artifact。
- Smoke 是压缩时间的功能验证，生命周期 CSV 中接近零的原始时间差不作为制度效果证据；三类 DetectionLag 均以 `/audit/detection-lags` 的情景输出为准。

## 时间戳口径

- `occurredAt`：链下业务事实发生时间；`NAVUpdatedEvent` 使用 `asOf`。实验冲击真值另存于链下 scenario 的 `shockAt`，不混入业务事件流。
- `submittedAt`：状态写入链上的时间；`NAVUpdatedEvent` 使用 `storedAt`。
- `disclosedAt`：R0-R4 制度与受众共同决定的可见时间。
- `observedAt`：投资者、监管者或审计者实际调用 API 的时间。
- `GateTriggered.occurredAt`：继承风险冲击的发生时间，而不是 Gate 交易执行时间；执行时间记录在 `submittedAt`。

## DetectionLag 口径

- 锚事件：`shockAt` 之后首个原始 `riskScoreBps >= tau` 的 `RiskMetricsSubmitted`。
- `SystemDetectionLag = anchor.submittedAt - shockAt`。
- `DisclosureDetectionLag(regime, audience) = firstDisclosedAt - shockAt`。
- `ObservationDetectionLag = firstPollingObservationAt - shockAt`。
- 永不披露的制度-受众组合标记为 `censored`，不使用空值或人为大数。
- API 的 300 秒窗口只约束实时 Oracle 输入相对快照区块的新鲜度，不构成 `shockAt` 到检测锚事件的滞后上限。

展示层阈值、检测阈值 `tau` 与控制阈值 `kappa` 分离。检测锚只读取原始评分，不读取 `riskLevel` 或 `gated`，避免控制状态反向制造“已检测”的循环定义。
