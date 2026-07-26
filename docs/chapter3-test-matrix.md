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
| 事件完整性 | PARTIAL | Solidity 事件测试、生命周期 ABI 严格解码、事件索引 smoke | P1-2 尚需补齐认购、估值折价、陈旧定价、流动性缓冲、swing pricing 和 side pocket 等论文事件 |
| 指标生成能力 | PASS | 六项指标顺序、归一化、HHI、赎回压力、队列比例、链上加权评分测试 | ValuationHaircut 与 LiquidityBufferRatio 仍由授权 Oracle 申报 |
| 角色可见性 | PASS | API Key RBAC 401/403、R0-R4 visibility/granularity/controlDisclosure 测试 | 原型为角色级认证，不提供投资者身份级横向隔离 |
| 四类时间戳 | PASS | occurred/submitted/disclosed/observed 映射、CSV/JSON 导出和原始 lag 测试 | DetectionLag 的最终 T_Detected 定义等待导师确认 |
| 隐私保护 | PARTIAL | 受保护端点、聚合披露、VC 承诺哈希 | 许可链原始日志仍含地址；ZK 与生产身份系统不在原型范围 |
| 仿真映射 | PARTIAL | simulation 导出提供 recording/disclosure/observation lag | 第 5、6 章采用哪个 lag 作为因变量尚未确定 |
| 可编程控制 | PASS | score > kappa 自动 Gate、重复超阈值不重复触发、Gate 拦截新增和存量赎回测试 | Gate 为全额冻结；解除由 REGULATOR_ROLE 人工执行 |
| 可审计轨迹 | PASS | 事件幂等索引、commitmentHash、API 审计、CSV 导出、重复同步 0 插入 | 默认本地模式为内存；CI 已配置 PostgreSQL 重启验证，首次 workflow 通过后保留其运行证据 |

## 测试分层

| 层级 | 方法与技术 | 主要验证内容 | 证据文件 |
| --- | --- | --- | --- |
| 合约单元与 Fuzz | Foundry、Solidity、256 组 Fuzz | 权限、评分不变量、阈值、Gate、赎回队列、事件 | `contracts.log` |
| API 单元 | Node test runner、TypeScript、纯函数测试 | 指标计算、最大余数法、制度引擎、RBAC、控制事件时间 | `api-tests.tap` |
| 静态检查 | TypeScript strict mode | 类型边界、ABI 调用和路由组合 | `typecheck.log` |
| 端到端 | Anvil、Foundry Script、Fastify、curl | 准入、认购、登记、NAV、赎回、评分、Gate、披露、审计 | `smoke.log` |
| 持久化集成 | PostgreSQL、API 重启验证 | 建表、upsert、重启后事件仍可读取 | `postgres-persistence.json` |

## 时间戳口径

- `occurredAt`：链下业务事实或风险冲击发生时间；`NavPosted` 使用 `asOf`。
- `submittedAt`：状态写入链上的时间；`NavPosted` 使用 `storedAt`。
- `disclosedAt`：R0-R4 制度与受众共同决定的可见时间。
- `observedAt`：投资者、监管者或审计者实际调用 API 的时间。
- `GateTriggered.occurredAt`：继承风险冲击的发生时间，而不是 Gate 交易执行时间；执行时间记录在 `submittedAt`。

测试只输出 `recordingLagSec`、`disclosureLagSec` 和 `observationLagSec`，不在导师确认前指定唯一 DetectionLag。
