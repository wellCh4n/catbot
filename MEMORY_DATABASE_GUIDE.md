# Memory Search 数据库生成指南

## 📊 当前状态

检查结果：
- ✅ `workspace/memory/` 目录存在
- ✅ `workspace/memory/privacy.md` 文件存在
- ❌ **没有 `.sqlite` 数据库文件**
- ❌ **没有 `sessions/` 目录**
- ❌ **没有 `catbot.json` 配置文件**

**结论**: 应用尚未运行，或数据存储在其他位置。

## 🔄 数据库文件生成的完整流程

### 1️⃣ 启动应用触发

```typescript
// 在 agent-manager.ts 的 run() 方法中
if (!this.memorySearch) {
  this.memorySearch = new MemorySearchEngine(sessionId, config, settingsManager)
  await this.memorySearch.init()  // ← 这里会创建数据库
}
```

### 2️⃣ init() 执行

```typescript
async init() {
  // 1. 创建 VectorStore（会创建 .sqlite 文件）
  this.vectorStore = new VectorStore({
    path: 'workspace/memory/main.sqlite'  // ← 文件在这里创建
  })

  // 2. 如果 sync.onSessionStart = true，执行同步
  if (this.config.sync.onSessionStart) {
    await this.syncAll()  // ← 索引 memory 文件和 sessions
  }
}
```

### 3️⃣ VectorStore 创建文件

```typescript
constructor(options: VectorStoreOptions) {
  this.db = new Database(options.path)  // ← SQLite 立即创建文件
  this.initSchema()  // ← 创建表结构
}
```

## 🎯 触发生成的步骤

### 方法 1: 启动应用并发送消息

```bash
# 1. 启动应用
pnpm dev

# 2. 在应用中发送任意消息
"你好"

# 3. 查看生成的文件
ls -la workspace/memory/
# 应该看到: main.sqlite
```

### 方法 2: 检查应用日志

启动应用后，查看控制台日志：

**成功初始化**：
```
[agent-manager] Memory search initialized
[MemorySearch] Initialized with config: {...}
[MemorySearch] Starting initialization...
[MemorySearch] Using API key from chat settings
[MemorySearch] Syncing data sources...
[MemorySearch] Found 1 files in workspace/memory
[MemorySearch] Indexed privacy.md: 3 chunks
[MemorySearch] Initialization complete
```

**如果失败**：
```
[agent-manager] Failed to initialize memory search: Error: ...
```

## 🔍 验证数据库是否生成

### 检查文件
```bash
# 查看数据库文件
ls -lh workspace/memory/*.sqlite

# 预期输出:
# -rw-r--r--  1 user  staff   20K  Mar 9 18:50 main.sqlite
```

### 查看数据库内容
```bash
# 安装 sqlite3（如果没有）
brew install sqlite3

# 查看表结构
sqlite3 workspace/memory/main.sqlite ".tables"
# 预期输出: chunks  chunks_fts  embeddings

# 查看已索引的 chunk 数量
sqlite3 workspace/memory/main.sqlite "SELECT COUNT(*) FROM chunks;"
```

## 📁 完整的文件结构（应用运行后）

```
workspace/
├── memory/
│   ├── privacy.md          # ✅ 你创建的文件
│   └── main.sqlite         # ⭐ 自动生成（首次运行后）
│       ├── chunks 表       # 文本内容
│       ├── embeddings 表   # 向量数据
│       └── chunks_fts 表   # 全文搜索索引
│
├── sessions/
│   └── main.jsonl          # ⭐ 对话历史（首次发送消息后）
│
├── prompts/
│   ├── IDENTITY.md         # ⭐ 自动生成
│   └── AGENTS.md           # ⭐ 自动生成
│
└── catbot.json             # ⭐ 配置文件（首次运行后）
```

## ⚠️ 常见问题

### 1. 应用启动但没有生成数据库

**可能原因**：
- Memory Search 初始化失败（查看日志错误）
- 配置中 `enabled: false`
- 初始化时抛出异常被捕获

**解决方法**：
```bash
# 启动应用并查看完整日志
pnpm dev 2>&1 | grep -i memory
```

### 2. 数据库文件生成但很小（<10KB）

**原因**: 没有数据被索引

**检查**：
```bash
# 查看数据库大小
ls -lh workspace/memory/*.sqlite

# 查看 chunks 数量
sqlite3 workspace/memory/main.sqlite "SELECT COUNT(*) FROM chunks;"

# 如果是 0，说明没有索引任何内容
```

### 3. 找不到 workspace 目录

**可能原因**：数据存储在用户目录

**查找**：
```bash
# 在用户目录查找
find ~/Library/Application\ Support -name "catbot" -type d 2>/dev/null

# 或者查找所有 .sqlite 文件
find ~ -name "*.sqlite" -path "*/catbot/*" 2>/dev/null
```

## 🧪 手动测试脚本

创建测试文件强制触发索引：

```bash
# 1. 创建多个测试文件
mkdir -p workspace/memory
cat > workspace/memory/test1.md << 'EOF'
# 测试文档 1
这是第一个测试文档，包含一些测试内容。
EOF

cat > workspace/memory/test2.md << 'EOF'
# 测试文档 2
这是第二个测试文档，包含更多测试内容。
EOF

# 2. 启动应用
pnpm dev

# 3. 发送消息触发初始化
# 在应用中输入："你好"

# 4. 检查数据库
ls -lh workspace/memory/*.sqlite
sqlite3 workspace/memory/main.sqlite "SELECT content FROM chunks LIMIT 3;"
```

## 💡 强制重新索引

如果需要重新索引：

```bash
# 1. 删除旧数据库
rm workspace/memory/*.sqlite

# 2. 重启应用
# Memory Search 会自动重新创建并索引
```

## 📝 总结

**数据库文件生成时机**：
1. ✅ 首次运行应用时
2. ✅ 首次发送消息时
3. ✅ `MemorySearchEngine.init()` 被调用时

**如果还没有生成**：
- 应用可能还没有运行
- 或者应用在不同的目录运行
- 或者初始化时出错（查看日志）

**下一步**：
1. 运行 `pnpm dev`
2. 发送一条消息
3. 检查 `workspace/memory/` 目录
4. 应该会看到 `main.sqlite` 文件
