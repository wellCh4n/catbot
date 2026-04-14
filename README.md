# CatBot

A Desktop Agent App. Like OpenClaw, but with zero setup required.

<img src="https://github.com/wellCh4n/catbot/blob/main/resources/icon.png" width="200" />

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## Changelog

- **2026-04-14**：
  - 修复流式输出遇到网络瞬断（Socket 断开 / `UND_ERR_SOCKET`）时 Agent 循环直接崩溃的问题，新增最多 3 次指数退避重试（1s → 2s → 4s）
- **2026-04-02**：
  - 新增聊天界面模型选择器，支持根据 Provider 动态切换模型（Anthropic / OpenAI / Google Gemini / Minimax），支持自定义模型名
  - 模型选择从设置页迁移至聊天输入框，选择即生效，不再经过磁盘配置文件中转
  - 新增多 Provider 支持：Google Gemini、Minimax
  - 记忆系统重构：用文件级记忆（MEMORY.md + topics/）替代 OpenAI Embedding 向量搜索，改用 LLM 相关性排序
  - 后台记忆提取 Agent 增加 JSON 自动修复，容错处理 LLM 输出格式问题
  - 新增流式输出支持及设置开关
- **2026-03-18**：接入钉钉机器人，支持 Stream 模式收发消息，无需公网 IP
- **2026-03-09**：新增记忆系统，Agent 可检索历史会话上下文
- **2026-03-04**：项目初始化，支持飞书机器人接入、多会话管理、技能系统
