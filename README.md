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

- **2026-03-18**：接入钉钉机器人，支持 Stream 模式收发消息，无需公网 IP
- **2026-03-09**：新增记忆系统，Agent 可检索历史会话上下文
- **2026-03-04**：项目初始化，支持飞书机器人接入、多会话管理、技能系统
