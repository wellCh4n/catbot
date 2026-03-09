# Memory Search 路径修复总结

## ✅ 问题已修复

### 之前的问题
Memory Search 数据库文件没有生成，因为：
1. 在构造函数中立即创建 VectorStore，但 `memory/` 目录可能不存在
2. SQLite 无法创建数据库文件导致初始化失败

### 修复内容

#### 1. 调整初始化顺序 (`memory-search.ts`)
```typescript
// 修复前：在构造函数中创建
constructor() {
  this.vectorStore = new VectorStore({ path: '...' })  // ❌ 目录可能不存在
}

// 修复后：在 init() 中按顺序创建
async init() {
  // 1. 先创建目录
  await mkdir(dirname(this.config.store.path), { recursive: true })

  // 2. 再创建 VectorStore
  this.vectorStore = new VectorStore({ path: this.config.store.path })

  // 3. 创建 embedding provider
  // 4. 执行同步
}
```

#### 2. 添加非空检查
- `vectorStore` 和 `embeddingProvider` 改为可选属性
- 在所有使用前添加非空检查或自动初始化

## 📍 正确的数据存储路径

### 应用数据目录
```
~/.catbot/workspace/
├── AGENTS.md           # Agent 配置
├── IDENTITY.md         # 身份提示词
├── catbot.json         # 应用配置 (包含 API Key)
│
├── memory/             # ⭐ Memory Search 数据 (自动生成)
│   └── main.sqlite    # 向量数据库
│
├── sessions/           # 会话历史
│   └── main.jsonl
│
└── skills/             # 技能文件
```

**绝对路径**: `/Users/xgenie/.catbot/workspace/`

### 配置定义
```typescript
// src/main/configs.ts
export const WORKSPACE_PATH = join(homedir(), '.catbot', 'workspace')
```

## 🔍 验证工具

### 使用方法
```bash
./check-memory.sh
```

### 预期输出（应用运行后）
```
✅ 应用数据目录存在
✅ memory/ 目录存在
✅ 找到数据库文件:
   - main.sqlite (24K)
     表: chunks chunks_fts embeddings
     已索引: 12 个 chunks
     数据源: memory, sessions
✅ sessions/ 目录存在
   - main.jsonl: 35 条消息
✅ Memory Search 正常工作!
```

## 🚀 下一步测试

### 1. 启动应用
```bash
pnpm dev
```

### 2. 发送第一条消息
在应用中输入任意消息，如："你好"

### 3. 验证数据库已生成
```bash
./check-memory.sh
```

应该能看到：
- ✅ `~/.catbot/workspace/memory/` 目录已创建
- ✅ `main.sqlite` 文件已生成
- ✅ 数据已索引

### 4. 添加知识库文件（可选）
```bash
# 创建测试文件
cat > ~/.catbot/workspace/memory/guide.md << 'EOF'
# CatBot 使用指南

## 功能
- 对话聊天
- 代码生成
- 文件操作

## 配置
在设置页面配置 API Key
EOF

# 重启应用，会自动索引新文件
```

### 5. 测试记忆搜索
在应用中提问：
- "如何配置？"
- "有什么功能？"

应该能在日志中看到：
```
[agent-manager] Memory search initialized
[MemorySearch] Ensured directory exists: /Users/xgenie/.catbot/workspace/memory
[MemorySearch] Vector store created at: /Users/xgenie/.catbot/workspace/memory/main.sqlite
[MemorySearch] Found 1 files in /Users/xgenie/.catbot/workspace/memory
[MemorySearch] Indexed guide.md: 3 chunks
[agent-manager] Found 2 relevant memories
```

## 📊 数据生命周期

### 首次运行
```
启动应用 (pnpm dev)
    ↓
用户发送消息
    ↓
触发 AgentManager.run()
    ↓
初始化 MemorySearchEngine
    ↓
执行 init():
  1. mkdir ~/.catbot/workspace/memory (递归创建)
  2. 创建 main.sqlite
  3. 初始化表结构 (chunks, embeddings, chunks_fts)
  4. 扫描并索引 memory 文件
  5. 索引 session 历史
    ↓
数据库就绪，可以搜索
```

### 后续运行
```
启动应用
    ↓
用户发送消息
    ↓
MemorySearchEngine 已初始化
    ↓
搜索相关记忆（几十毫秒）
    ↓
增强系统提示
```

## 🎯 关键改进

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| 目录创建 | ❌ 不自动创建 | ✅ `mkdir -p` 递归创建 |
| 初始化顺序 | ❌ 构造函数中 | ✅ `init()` 中按顺序 |
| 错误处理 | ❌ 可能静默失败 | ✅ 详细日志 + 非空检查 |
| 验证工具 | ❌ 无 | ✅ `check-memory.sh` |
| 数据位置 | ✅ 正确 | ✅ 保持不变 |

## ✨ 核心代码

### 目录创建
```typescript
// memory-search.ts init() 方法
const memoryDir = dirname(this.config.store.path)
await mkdir(memoryDir, { recursive: true })
console.log(`[MemorySearch] Ensured directory exists: ${memoryDir}`)
```

### 路径配置
```typescript
// config.ts
function resolveStorePath(sessionId: string, rawPath?: string): string {
  const fallback = join(WORKSPACE_PATH, 'memory', `${sessionId}.sqlite`)
  return rawPath ? rawPath.replaceAll('{sessionId}', sessionId) : fallback
}
```

## 📝 文件清理

删除了错误的测试文件：
- ❌ `workspace/memory/privacy.md` (项目目录)
- ❌ `verify-memory.sh` (旧版本)

创建了新工具：
- ✅ `check-memory.sh` (正确路径)
- ✅ `MEMORY_DATABASE_GUIDE.md` (文档)

## 🔒 数据安全

所有数据存储在：
```
~/.catbot/workspace/
```

**特点**：
- ✅ 完全本地存储
- ✅ 用户主目录下
- ✅ 隐藏目录（`.catbot`）
- ✅ 与项目代码分离
- ✅ 持久化保存
- ✅ 应用卸载后可手动删除

现在 Memory Search 已经正确配置，数据会存储在正确的应用数据目录中！🎉
