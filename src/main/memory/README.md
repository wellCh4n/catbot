# Memory Search Module

基于 OpenClaw 架构的记忆搜索系统，为 CatBot 提供智能上下文检索能力。

## 功能特性

- ✅ **多源支持**: 支持搜索 memory 文件和 sessions 会话历史
- ✅ **多种 Embedding 提供商**: OpenAI, Ollama, Gemini, Voyage, Mistral
- ✅ **混合搜索**: 向量相似度 + 全文搜索 (FTS5)
- ✅ **高级检索算法**:
  - MMR (Maximal Marginal Relevance) - 结果多样性
  - 时间衰减 - 优先近期记忆
  - 可配置的向量/文本权重
- ✅ **SQLite 存储**: 轻量级、高性能
- ✅ **智能缓存**: 减少重复查询开销
- ✅ **自动同步**: 支持 watch、定时同步

## 架构概览

```
src/main/memory/
├── types.ts           # 类型定义
├── config.ts          # 配置解析
├── embeddings.ts      # Embedding 提供商
├── vector-store.ts    # SQLite 向量存储
├── memory-search.ts   # 主搜索引擎
├── index.ts           # 导出模块
└── README.md          # 文档
```

## 快速开始

### 1. 基础用法

```typescript
import { MemorySearchEngine } from './memory'
import { SettingsManager } from '../managers/settings-manager'

// 初始化（会自动从 catbot.json 获取 API Key）
const settingsManager = new SettingsManager()
const memorySearch = new MemorySearchEngine('main', {
  enabled: true,
  provider: 'openai',
  model: 'text-embedding-3-small'
}, settingsManager)

await memorySearch.init()

// 搜索
const results = await memorySearch.search({
  query: 'How to configure API settings?',
  maxResults: 5,
  minScore: 0.3
})

// 使用结果
for (const result of results) {
  console.log(`[Score: ${result.score}] ${result.chunk.content}`)
}

memorySearch.close()
```

**注意**: API Key 优先级：
1. `config.remote.apiKey` (传入的配置)
2. `catbot.json` 中的 `model.apiKey` (Chat 配置)
3. `process.env.OPENAI_API_KEY` (环境变量)

### 2. 集成到 AgentManager

在 `AgentManager.run()` 中增强系统提示：

```typescript
import { MemorySearchEngine } from '../memory'

// 在 AgentManager 类中
async run(sessionId: string, message: ChatMessage): Promise<string> {
  // ... 现有代码 ...

  // 初始化记忆搜索
  const memorySearch = new MemorySearchEngine(sessionId)
  await memorySearch.init()

  // 搜索相关上下文
  const memoryResults = await memorySearch.search({
    query: message.content,
    maxResults: 3,
    minScore: 0.4,
    sources: ['memory', 'sessions']
  })

  // 构建记忆上下文
  let memoryContext = ''
  if (memoryResults.length > 0) {
    memoryContext = '\n\n# Relevant Context from Memory\n\n'
    memoryContext += memoryResults
      .map((r, i) => `## Memory ${i + 1} (Relevance: ${(r.score * 100).toFixed(1)}%)\n${r.chunk.content}`)
      .join('\n\n')
  }

  // 增强系统提示
  const enhancedSystem = [
    SYSTEM_PROMPT,
    identityPrompt,
    agentsPrompt,
    skillsContext,
    memoryContext
  ]
    .filter(Boolean)
    .join('\n\n')

  // ... 继续执行 agent loop ...

  memorySearch.close()
}
```

## 配置选项

### Provider 配置

#### OpenAI
```typescript
{
  provider: 'openai',
  model: 'text-embedding-3-small', // 或 text-embedding-3-large
  // API Key 会自动从 catbot.json 获取
  // 如需覆盖，可以指定:
  // remote: { apiKey: 'sk-...' }
}
```

#### Ollama (本地)
```typescript
{
  provider: 'ollama',
  model: 'nomic-embed-text',
  remote: {
    baseUrl: 'http://localhost:11434'
  }
}
```

#### Auto (自动选择)
```typescript
{
  provider: 'auto', // 有 API key 用 OpenAI，否则用本地
}
```

### 搜索配置

```typescript
{
  query: {
    maxResults: 6,
    minScore: 0.35,
    hybrid: {
      enabled: true,
      vectorWeight: 0.7,    // 向量搜索权重
      textWeight: 0.3,      // 全文搜索权重
      candidateMultiplier: 4,
      mmr: {
        enabled: true,      // 启用多样性
        lambda: 0.7         // 相关性 vs 多样性平衡
      },
      temporalDecay: {
        enabled: true,      // 时间衰减
        halfLifeDays: 30    // 30天半衰期
      }
    }
  }
}
```

### 同步配置

```typescript
{
  sync: {
    onSessionStart: true,  // 启动时同步
    onSearch: true,        // 搜索前同步
    watch: true,           // 文件监听
    watchDebounceMs: 1500,
    intervalMinutes: 0,    // 定时同步（0=禁用）
    sessions: {
      deltaBytes: 100_000,    // 增量同步阈值
      deltaMessages: 50
    }
  }
}
```

## 数据源

### Memory 文件
存储在 `workspace/memory/` 目录，支持：
- `.md` - Markdown 文件
- `.txt` - 纯文本文件

### Sessions 会话历史
自动索引 `workspace/sessions/*.jsonl` 中的对话记录

### 额外路径
```typescript
{
  extraPaths: [
    '/path/to/docs',
    '/path/to/knowledge-base'
  ]
}
```

## 存储

### 数据库结构
```sql
-- 主表
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  session_id TEXT,
  message_id TEXT,
  metadata TEXT
);

-- 向量表
CREATE TABLE embeddings (
  chunk_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  dimension INTEGER NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  id UNINDEXED,
  content,
  content='chunks'
);
```

### 存储路径
默认: `workspace/memory/{sessionId}.sqlite`

可自定义:
```typescript
{
  store: {
    path: '/custom/path/{sessionId}.sqlite'
  }
}
```

## 性能优化

### 1. 批量索引
```typescript
// 推荐: 批量插入
vectorStore.insertBatch(chunks)

// 避免: 逐个插入
chunks.forEach(chunk => vectorStore.insert(chunk))
```

### 2. 缓存策略
```typescript
{
  cache: {
    enabled: true,
    maxEntries: 1000  // 限制缓存大小
  }
}
```

### 3. 选择性同步
```typescript
{
  sources: ['memory'],  // 只索引 memory 文件，跳过 sessions
  sync: {
    onSearch: false,    // 禁用每次搜索前同步
    intervalMinutes: 60 // 改为定时同步
  }
}
```

## API 参考

### MemorySearchEngine

#### `init(): Promise<void>`
初始化搜索引擎，执行初始同步

#### `search(options: MemorySearchOptions): Promise<MemorySearchResult[]>`
执行记忆搜索

#### `syncAll(): Promise<void>`
手动同步所有数据源

#### `clearCache(): void`
清空搜索缓存

#### `close(): void`
关闭数据库连接，清理资源

### 类型定义

```typescript
interface MemorySearchOptions {
  query: string              // 搜索查询
  maxResults?: number        // 最大结果数
  minScore?: number          // 最小相似度分数
  sources?: MemorySource[]   // 数据源过滤
  sessionId?: string         // 会话ID过滤
}

interface MemorySearchResult {
  chunk: MemoryChunk         // 内容块
  score: number              // 相似度分数 (0-1)
  relevance?: number         // 相关性分数
}

interface MemoryChunk {
  id: string
  content: string
  embedding?: number[]
  metadata: {
    source: string
    sourceType: MemorySource
    timestamp: number
    sessionId?: string
    messageId?: string
    [key: string]: unknown
  }
}
```

## 故障排除

### SQLite 错误
```bash
# 重新编译原生模块
pnpm rebuild better-sqlite3
```

### API Key 问题
API Key 会自动从 `workspace/catbot.json` 的 `model.apiKey` 字段获取。
如果未配置，可以：
1. 在设置页面配置 API Key
2. 使用 Ollama 本地模型（无需 API Key）
3. 使用 `provider: 'auto'` 自动回退到 dummy embeddings

### 向量搜索不工作
确保向量功能已启用：
```typescript
{
  store: {
    vector: {
      enabled: true
    }
  }
}
```

## 示例场景

### 场景 1: 技术文档助手
```typescript
// 索引项目文档
const memorySearch = new MemorySearchEngine('docs', {
  extraPaths: [
    './docs',
    './README.md',
    './API.md'
  ]
})

await memorySearch.init()

// 用户提问
const results = await memorySearch.search({
  query: 'How do I authenticate with the API?',
  maxResults: 3
})
```

### 场景 2: 会话上下文感知
```typescript
// 搜索当前会话的历史
const results = await memorySearch.search({
  query: 'what was the error message?',
  sources: ['sessions'],
  sessionId: 'current-session-id',
  maxResults: 5
})
```

### 场景 3: 知识库问答
```typescript
// 结合多个来源
const results = await memorySearch.search({
  query: userQuestion,
  sources: ['memory', 'sessions'],
  maxResults: 10,
  minScore: 0.5  // 高质量结果
})
```

## 未来改进

- [ ] 支持更多 embedding 提供商 (Cohere, HuggingFace)
- [ ] ANN (近似最近邻) 索引优化
- [ ] 实时增量索引
- [ ] 多语言支持
- [ ] 结构化元数据查询
- [ ] 自定义分词器

## 参考资源

- [OpenClaw Memory Search](https://github.com/context-labs/openclaw)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [Anthropic Embeddings](https://docs.anthropic.com/)
- [Ollama](https://ollama.ai/)
