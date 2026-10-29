---
title: 部署到 Cloudflare Workers
description: 通过 Git 集成将 Sink 部署到 Cloudflare Workers。
---

# 部署到 Cloudflare Workers

## 1. Fork Sink 并创建资源

[Fork Sink 仓库](https://github.com/miantiao-me/Sink/fork)。在 [Cloudflare 仪表盘](https://dash.cloudflare.com/) 中创建：

| 绑定名称    | 产品                    | 是否必需 | 说明           |
| ----------- | ----------------------- | -------- | -------------- |
| `DB`        | D1 数据库               | 必需     | 保存链接       |
| `KV`        | KV 命名空间             | 必需     | 加速跳转       |
| `ANALYTICS` | Analytics Engine 数据集 | 推荐     | 访问统计       |
| `R2`        | R2 存储桶               | 可选     | 备份与社交图片 |
| `AI`        | Workers AI              | 可选     | AI 建议        |

在 D1、KV 各自的详情页复制 **数据库 ID** 和 **命名空间 ID**。

访问分析是可选的——不配也能用短链。启用步骤见[访问分析与近实时视图](/zh-CN/features/analytics)。

## 2. 连接 Git（Workers Builds）

在 Cloudflare 仪表盘中创建带 **Git 集成** 的 Worker，并连接你的 Fork：

- **生产分支：** `master`
- **构建命令：** `pnpm build`
- **部署命令：** `pnpm deploy:worker`

添加这些**构建变量**（**不要**把生产环境 ID 写进仓库里的 `wrangler.jsonc` — 请用 `DEPLOY_*`）：

| 变量                             | 填什么                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `DEPLOY_D1_DATABASE_ID`          | D1 数据库 ID（在 D1 详情页）                                                      |
| `DEPLOY_KV_NAMESPACE_ID`         | KV 命名空间 ID（在 KV 详情页）→ `kv_namespaces[].id`                              |
| `DEPLOY_KV_PREVIEW_NAMESPACE_ID` | 可选 Wrangler 预览 KV → `preview_id`（默认等于 `DEPLOY_KV_NAMESPACE_ID`）         |
| `DEPLOY_R2_BUCKET_NAME`          | R2 存储桶名称（仅在使用 R2 时；不填则生成配置里不含 R2）→ `bucket_name`           |
| `DEPLOY_R2_PREVIEW_BUCKET_NAME`  | 可选 Wrangler 预览 R2 → `preview_bucket_name`（默认等于 `DEPLOY_R2_BUCKET_NAME`） |
| `DEPLOY_D1_DATABASE_NAME`        | 可选；默认 `sink`                                                                 |
| `DEPLOY_ANALYTICS_DATASET`       | 可选；默认 `sink`（若改了，请与 `NUXT_DATASET` 保持一致）                         |

`pnpm deploy:worker` 会根据这些值生成被 gitignore 的 `wrangler.deploy.jsonc`，更新 D1 结构后部署。连接仓库时 Cloudflare 会生成部署令牌 — 不用再单独粘贴部署密钥。

## 3. 应用设置（登录密码等）

在 **Settings → Variables and Secrets** 中添加：

| 变量                 | 类型     | 用途                                                               |
| -------------------- | -------- | ------------------------------------------------------------------ |
| `NUXT_SITE_TOKEN`    | 加密密钥 | 仪表盘登录密码和 API 密码（至少 8 个字符且不含空白字符，保持稳定） |
| `NUXT_CF_ACCOUNT_ID` | 变量     | 访问分析推荐                                                       |
| `NUXT_CF_API_TOKEN`  | 加密密钥 | 访问分析推荐                                                       |

如需启用首页游客短链，请先为域名创建 [Cloudflare Turnstile 组件](https://developers.cloudflare.com/turnstile/get-started/)，再添加以下**运行时变量和密钥**：

| 变量                                      | 类型     | 默认值  | 用途                                    |
| ----------------------------------------- | -------- | ------- | --------------------------------------- |
| `NUXT_PUBLIC_GUEST_LINKS_ENABLED`         | 变量     | `false` | 设为 `true` 后显示游客表单并开放接口    |
| `NUXT_PUBLIC_GUEST_LINK_PREFIX`          | 变量     | `u`     | 游客短链格式为 `/u/<短码>`              |
| `NUXT_PUBLIC_TURNSTILE_SITE_KEY`         | 变量     | —       | Turnstile 站点公钥                      |
| `NUXT_TURNSTILE_SECRET`                  | 加密密钥 | —       | Turnstile 私钥                          |
| `NUXT_GUEST_LINK_DAILY_LIMIT_PER_IP`     | 变量     | `10`    | 每个 IP 每个 UTC 日成功生成数量         |
| `NUXT_GUEST_LINK_GLOBAL_LIMIT`           | 变量     | `10000` | 全站有效游客短链上限                    |
| `NUXT_GUEST_LINK_EXPIRATION_DAYS`        | 变量     | `180`   | 游客短链有效天数；`0` 表示不设到期时间  |
| `NUXT_GUEST_LINK_CLEANUP_DAYS`           | 变量     | `7`     | 到期后保留天数，再永久删除              |

游客短链会自动加上 `guest` 标签，可在后台统一管理。更改前缀后可配置旧前缀别名以保留已分享链接，详见[配置参考](/zh-CN/configuration/)。KV 到 D1 迁移完成后，清理由现有 Workers 每日定时任务执行。

还可在 Cloudflare WAF 中为 `POST /_guest/links` 添加按客户端 IP 计数的限速规则，降低验证接口遭到请求洪泛的风险。应用本身也会在 D1 中执行每日 IP 配额和全站有效游客短链上限。

访问分析细节见[访问分析与近实时视图](/zh-CN/features/analytics)。完整列表见[配置参考](/zh-CN/configuration/)。

确认绑定名称正好是 `DB`、`KV`、`ANALYTICS`、`R2`、`AI`。

## 4. 部署并首次使用

从 `master` 启动构建，等待完成。

1. 打开 `/dashboard`，用 `NUXT_SITE_TOKEN` 登录
2. 打开一次 **Dashboard → Links**（一次性存储初始化）
3. 创建链接

::: tip 必须先打开一次 Links
存储初始化完成前，创建链接可能失败，并提示「存储未就绪」（HTTP 423）。
:::

后续升级见[升级 Sink](./upgrading)。
