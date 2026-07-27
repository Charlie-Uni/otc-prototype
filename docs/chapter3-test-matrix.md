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
| 指标生成能力 | PASS | NAVAdjustment、链上估值折价/流动性输入、六项指标顺序、归一化、HHI、赎回压力、队列比例、链上加权评分测试 | 赎回压力当前按申请流量计算，最终论文公式口径需与导师确认 |
| 角色可见性 | PASS | API Key RBAC 401/403、R0-R4 visibility/granularity/controlDisclosure 测试 | 原型为角色级认证，不提供投资者身份级横向隔离 |
| 四类时间戳 | PASS | occurred/submitted/disclosed/observed 映射、CSV/JSON 导出、三类 DetectionLag 测试 | observedAt 取决于实验声明的轮询频率 |
| 隐私保护 | PARTIAL | 受保护端点、聚合披露、VC 承诺哈希 | 许可链原始日志仍含地址；ZK 与生产身份系统不在原型范围 |
| 仿真映射 | PASS | 链下 shockAt、原始评分锚事件、制度-受众披露滞后、轮询观察滞后和删失值测试 | 第 5、6 章可分别选择三类 lag，不把三者混为一个指标 |
| 可编程控制 | PASS | score > kappa 自动 Gate、监管解除、Swing Pricing/Side Pocket 状态与规则承诺、Gate 拦截新增和存量赎回测试 | Gate 为全额冻结；扩展控制不执行完整资产会计 |
| 可审计轨迹 | PASS | 事件幂等索引、commitmentHash、API 审计、CSV 导出、重复同步 0 插入 | 默认本地模式为内存；PostgreSQL 重启验证由 CI 执行，本地无数据库运行时标记为 not_run |

## 测试分层

| 层级 | 方法与技术 | 主要验证内容 | 证据文件 |
| --- | --- | --- | --- |
| 合约单元、Fuzz 与覆盖率 | Foundry、Solidity、256 组 Fuzz、forge coverage | 权限、认购状态机、基金化 NAV、NAVAdjustment、Oracle 状态、评分不变量、阈值、Gate、扩展控制、赎回队列、事件 | `contracts.log`、`coverage.log` |
| API 单元 | Node test runner、TypeScript、纯函数测试 | 指标计算、最大余数法、制度引擎、RBAC、控制事件时间、DetectionLag、敏感性 | `api-tests.tap` |
| 静态检查 | TypeScript strict mode | 类型边界、ABI 调用和路由组合 | `typecheck.log` |
| 端到端 | Anvil、Foundry Script、Fastify、curl | 准入、认购、登记、NAV、估值/流动性 Oracle、赎回、评分、Gate、扩展控制、披露、审计 | `smoke.log` |
| 持久化集成 | PostgreSQL、API 重启验证 | 建表、upsert、重启后事件仍可读取 | `postgres-persistence.json` |

## 当前验证快照

- Foundry：56 项合约测试通过，其中 Fuzz 每次运行 256 组输入。
- API：49 项 Node/TypeScript 测试通过。
- 静态检查：TypeScript `--noEmit` 通过。
- 端到端：独立部署、链上指标溯源、7702 bps 高风险评分、Gate、R0-R4、审计与仿真全部通过。
- 合约行覆盖率：FundToken 96.72%、NAVRegistry 100%、RiskRegistry 97.22%；原始输出由统一测试入口生成到 `coverage.log`。部署脚本由端到端 smoke 验证，不计入业务合约覆盖率。
- 运行时代码：FundToken 18689 B、NAVRegistry 8419 B、RiskRegistry 19095 B，均低于 EIP-170 的 24576 B。
- 固定摘要见 `docs/evidence/chapter3-summary.json`。完整日志由本地 `test-results/` 或 GitHub Actions artifact 生成；该次本地运行未配置 PostgreSQL，因此持久化项为 `not_run`，CI 负责执行数据库路径。

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

展示层阈值、检测阈值 `tau` 与控制阈值 `kappa` 分离。检测锚只读取原始评分，不读取 `riskLevel` 或 `gated`，避免控制状态反向制造“已检测”的循环定义。
