# 第 3 章系统静态分析与人工分级

## 目的与边界

静态分析用于补充 Foundry 单元测试、Fuzz、覆盖率、TypeScript 类型检查和端到端测试。它帮助发现常见合约缺陷与脚本错误，但不等同于第三方安全审计、形式化验证或生产环境安全认证。

当前静态分析基线：

- 源码提交：`b5fe1c8ec2153d1e84e0492012be44a45182dfe2`
- GitHub Actions：`30505900279`
- Slither：`0.11.5`
- crytic-compile：`0.3.11`
- ShellCheck：`0.11.0`
- Slither 范围：20 个合约、101 个 detector；排除 `lib/`、`test/` 和 `script/`
- ShellCheck 范围：`scripts/test-chapter3.sh` 与 `scripts/smoke-risk-api.sh`，共 1305 行

原始 `slither.json`、`slither.log`、`slither-versions.txt` 和 `shellcheck.log` 由 CI 作为 artifact 保存，文件摘要见 `docs/evidence/chapter3-static-analysis-sha256.txt`。Slither 在存在任何 finding 时返回非零退出码，因此初始分级阶段保留非阻断运行，但原始结果始终上传，不能被静默忽略。

## 自动检查结果

- ShellCheck：warning 及以上级别 0 项。
- Slither 第一轮：22 项。人工复核后将 `RiskRegistry.setWeights()` 的 `totalWeightBps` 改为显式初始化，消除 1 项 `uninitialized-local`。
- Slither 第二轮：21 项，包括 High 1、Medium 1、Low 17、Informational 2。

## Slither 分级

| Detector | 数量 | 人工判断 | 处理 |
| --- | ---: | --- | --- |
| `uninitialized-state` | 1 High | `NAVRegistry.histories` 是 Solidity mapping。mapping 状态变量按语言规则具有默认空状态，不能也不需要在构造函数中整体初始化；所有读取均通过长度或存在性条件保护 | 假阳性，保留原实现与测试，不为规避 detector 增加无效代码 |
| `incorrect-equality` | 1 Medium | `redemptionQueueRatioBps()` 的 `totalSupply == 0` 是除零保护。该判断不用于价格、权限或赢家选择，不属于可操纵的临界相等条件 | 接受的防御性分支；已有零供应测试覆盖 |
| `timestamp` | 17 Low | 真正的时间比较用于拒绝未来 `asOf/occurredAt`、维持事件时间单调性和生成四类时间戳。报告中同时包含地址、布尔值、余额等并非时间的传播性误报 | 接受的研究设计；时间戳不用于随机数、竞拍或资产定价，只用于顺序、新鲜度和审计 |
| `missing-inheritance` | 2 Informational | `INAVRegistry` 与 `IRiskGate` 是 `FundToken` 的最小消费接口，用于降低调用方耦合；它们不是业务合约必须实现的完整公共接口 | 接受的架构选择；不为消除信息级提示引入循环依赖和无运行时收益的继承 |

第二轮结果中没有经人工复核后仍未处理的可利用 High 或 Medium 缺陷。该结论仅适用于当前研究原型、当前提交和当前分析范围，不应表述为“零漏洞”或“已通过生产安全审计”。

## 时间戳信任边界

第 3 章要求区分 `occurredAt`、`submittedAt`、`disclosedAt` 和 `observedAt`，因此不能移除链上时间语义。许可链验证者对区块时间可能存在有限调整空间；本原型仅依赖其进行未来时间拒绝、先后顺序和滞后测量，不依赖精确到秒的公平性或随机性。Oracle 业务时间另受角色权限、单调性和 API 快照窗口约束。

## 持续集成策略

- ShellCheck warning 及以上结果阻断 CI。
- Slither 在人工分级阶段不阻断 CI，原始 JSON、日志和版本必须上传。
- 不全局关闭 `timestamp`、`uninitialized-state` 等 detector，避免掩盖未来新增的真实问题。
- 每次业务合约语义变更后重新运行 Slither；新增或变化的 High/Medium finding 必须重新人工分级。
- Foundry、Fuzz、覆盖率和端到端测试仍是行为正确性的主要证据，静态分析是补充证据。
