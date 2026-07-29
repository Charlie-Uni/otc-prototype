# 第 3 章 Artifact 依赖加固记录

## 变更范围

本次加固只更新运行时依赖、工具链基线和 CI 安全门禁，不改变第 3 章系统的业务状态机、风险评分、透明度制度、权限矩阵、审计口径或测试断言。

主要变更：

- Fastify 从 4.x 升级至 5.10.0。
- viem 升级至 2.55.10。
- 应用与 CI 的 Node.js 基线升级至 22。
- GitHub Actions 升级至使用 Node 24 runtime 的当前 major。
- 通过 pnpm overrides 固定 `ajv@8.20.0` 与 `fast-uri@3.1.4`，消除已知传递依赖漏洞。
- CI 增加 `pnpm audit --prod --audit-level=high`，阻断新增 high/critical 生产依赖漏洞。

## 审计结果

| 级别 | 加固前 | 加固后 |
| --- | ---: | ---: |
| Critical | 0 | 0 |
| High | 11 | 0 |
| Moderate | 3 | 0 |
| Low | 1 | 0 |

## 回归验证

- 本地独立运行：commit `2078bbf`，artifact run `20260729T071153Z`。
- master CI：commit `d7b6e47`，workflow run `30431706179`，artifact run `20260729T072758Z`。
- 合约测试：83/83。
- API 测试：84/84。
- 合约行覆盖率：98.55%（340/345）。
- 端到端 smoke、基金绑定、部署角色分离：通过。
- PostgreSQL 16 事件与 API 审计重启持久化：master CI 通过。
- 生产依赖审计：0 项 low/moderate/high/critical。

完整机器可读摘要见 `chapter3-summary.json`，14 个 CI artifact 文件的 SHA-256 见 `chapter3-artifact-sha256.txt`。
