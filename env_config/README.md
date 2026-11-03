# env_config — 环境与依赖说明

## 运行时
- 宿主：DeepSeek Harness（Web profile），需已安装并启用 `dsh-connect-trae` 与 `dsh-connect-workbuddy`。
- Node.js：>= 22.19.0（与两个上游插件 `engines` 一致）。
- 无第三方运行时依赖：`dependencies` 为空，`dsh-connect-two` 是 Host + Client 纯 JS bundle。

## 本机已验证版本（2026-11-03）
| 组件 | 版本 |
|---|---|
| dsh-connect-trae | 4.6.12（上游已 4.7.0） |
| dsh-connect-workbuddy | 5.17.0（上游已 5.18.0） |
| dsh-connect-two | 0.1.0 |

## 状态文件
- `$DSH_HOME/dsh-connect-two/state.json`
- 内容：`config`（自动签到开关/时间/补签/覆盖应用）、`history`（最近 200 次签到记录）、`lastRunDay`（当天是否已自动执行）。
- 删除该文件即恢复默认（自动签到关闭）。

## 安装
无需手动执行 pnpm：在 Harness 内用 `plugin_manager install_bundle` 指向本目录 `src/` 即可，
它会完成链接、锁文件与 bundle 选择。

## 卸载
`plugin_manager remove_bundle` 移除 `dsh-connect-two`。
两个上游插件与其登录态不受影响。
