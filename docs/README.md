# dsh-connect-two

把本机 **Trae** 与 **WorkBuddy** 两个已登录账号的**积分**和**每日签到**汇总到一个面板，
并提供**默认关闭**的每日定时自动签到。

> 这是一个**伴随插件（companion bundle）**，不是 fork。
> `dsh-connect-trae` 与 `dsh-connect-workbuddy` 保持原样安装、继续接收上游更新；
> 本插件只读取它们的只读路由、调用它们已有的签到路由。

## 为什么不做「源码合并」

| | A. 伴随插件（本方案） | B. 合并成单一插件 |
|---|---|---|
| 统一面板管两个应用 | ✅ | ✅ |
| 上游继续更新 | ✅ 直接升级 | ❌ 与上游脱钩 |
| 维护成本 | 一个约 500 行的小包 | fork 两个 1.4MB 构建物、100+ 源文件 |
| 卸载后影响 | 两个插件照常工作 | 需自行维护全部功能 |

两个上游都是第三方高频迭代插件（交付时本地 4.6.12 / 5.17.0，上游已 4.7.0 / 5.18.0），
合并意味着从此手动追平每次更新。因此选 A。

## 功能

- **统一面板**：在「设置 → 插件 → 签到与积分」一页里看到 4 个面板
  （Trae 国内/国际、WorkBuddy 国内/国际）的登录态、可用/总额度、今日签到状态、连续天数。
- **一键签到 / 逐个签到**：只对**国内版**显示按钮（国际版无签到活动）。
- **每日自动签到**：默认关闭；开启后可设执行时间、选择覆盖的应用、可勾选「错过了也补签」。
- **签到记录**：手动与定时都留痕，显示每次是「成功 / 已领过 / 本机已用 / 失败」。

## 安装

在 Harness 内用 `plugin_manager` 的 `install_bundle` 指向本目录 `src/`：

```
install_bundle target = .../Project_009_dsh_connect_hub/src
```

安装返回 `application: "applied"` 即已生效。

**Host 半的改动需要重启一次 `dsh web` 才会加载**（Client 半有 HMR）。

## 使用

1. 打开「设置 → 插件」，切到「签到与积分」标签页。
2. 上方是四个面板的实时读数，点「刷新」重新拉取。
3. 点「全部签到」或某一行右侧「签到」立即领取当天奖励。
4. 想自动签到：在「每日自动签到」里打开开关 → 设时间 → 选覆盖的应用。
   到点由 Harness 后台执行；进程不在线时到点不执行，除非勾了「错过了也补签」。

## 产物结构

```
Project_009_dsh_connect_hub/
├─ src/                 # 插件本体的唯一来源（link 到 profile）
│  ├─ index.js          # Host 半：汇总/签到/配置/历史 路由 + 定时调度
│  ├─ client.js         # Client 半：设置页统一面板
│  ├─ package.json      # 含 dsh.bundle / dsh.client 声明
│  ├─ cordis.patch.yml  # 注册条目（默认自动签到关闭）
│  ├─ locale/{zh,en}.json
│  └─ icon.svg
├─ docs/                # 说明与实测记录
├─ env_config/          # 依赖与状态文件说明
├─ test/                # 契约测试（11 项）
└─ assets/
```

## 状态与配置

- 状态文件：`$DSH_HOME/dsh-connect-two/state.json`
- 删除即恢复默认（自动签到关闭）。
- 配置校验只有一处（`normalizeConfig`），非法时间会被归一化回合法值而不是写入。

## 测试

```bash
cd 01_项目仓库区/Project_009_dsh_connect_hub
node --test test/hub.test.js
node --test test/host-harness.test.js
```

## 边界（如实）

- 签到只有**国内版**有；国际版展示积分但不展示签到按钮。
- WorkBuddy 企业版/教育版席位的写接口会被上游拒绝，本插件如实显示失败，不做伪装。
- 自动签到的可靠性依赖 Harness 进程存活。
- 面板视觉未做浏览器肉眼验收（无浏览器控制），仅确认已注册且 active。
