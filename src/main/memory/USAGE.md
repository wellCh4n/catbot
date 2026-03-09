# Memory Search 使用指南

## 快速集成到 AgentManager

### 步骤 1: 添加 MemorySearch 属性

在 `src/main/managers/agent-manager.ts` 中：

```typescript
import { MemorySearchEngine } from '../memory'

export class AgentManager extends EventEmitter {
  private promptManager: PromptManager
  private settingsManager: SettingsManager
  private sessionManager: SessionManager
  private skillsManager: SkillsManager
  private memorySearch?: MemorySearchEngine // 添加这一行

  // ... 构造函数和其他方法 ...
}
```

### 步骤 2: 在 run() 方法中初始化和使用

```typescript
async run(
  sessionId: string,
  message: ChatMessage,
  onUpdate?: (update: AgentUpdate) => void
): Promise<string> {
  const startedAt = Date.now()
  try {
    // 1. 读取配置
    const config = await this.settingsManager.read()
    // ... 其他配置读取 ...

    // 2. 初始化 Memory Search（只初始化一次）
    if (!this.memorySearch) {
      this.memorySearch = new MemorySearchEngine(
        sessionId,
        {
          enabled: true,
          provider: 'auto', // 自动选择：有 API key 用 OpenAI，否则 dummy
          model: 'text-embedding-3-small',
          sources: ['memory', 'sessions'],
          query: {
            maxResults: 3,
            minScore: 0.4
          }
        },
        this.settingsManager // 传入 settingsManager 以获取 API key
      )
      await this.memorySearch.init()
      console.log('[AgentManager] Memory search initialized')
    }

    // 3. 搜索相关记忆（仅对用户消息）
    let memoryContext = ''
    if (message.role === 'user') {
      try {
        const memoryResults = await this.memorySearch.search({
          query: message.content,
          maxResults: 3,
          minScore: 0.4,
          sessionId
        })

        if (memoryResults.length > 0) {
          console.log(`[AgentManager] Found ${memoryResults.length} relevant memories`)

          memoryContext = '\n\n# Relevant Context from Memory\n\n'
          memoryResults.forEach((result, idx) => {
            const source =
              result.chunk.metadata.sourceType === 'sessions'
                ? `Previous Conversation`
                : `Memory File`

            memoryContext += `## Context ${idx + 1} (Relevance: ${(result.score * 100).toFixed(1)}%)\n`
            memoryContext += `Source: ${source}\n`
            memoryContext += `${result.chunk.content}\n\n---\n\n`
          })
        }
      } catch (error) {
        console.error('[AgentManager] Memory search failed:', error)
        // 继续执行，只是没有记忆上下文
      }
    }

    // 4. 构建系统提示（包含记忆上下文）
    const system = [
      SYSTEM_PROMPT,
      identityPrompt,
      agentsPrompt,
      skillsContext,
      memoryContext // 添加记忆上下文
    ]
      .filter(Boolean)
      .join('\n\n')

    console.log(
      `[AgentManager] system total=${system.length} memory=${memoryContext.length}`
    )

    // 5. 执行 agent loop
    const finalMessages = await this.executeLoop(messages, {
      client,
      model: modelName || 'claude-3-opus-20240229',
      system, // 使用增强的系统提示
      // ... 其他参数 ...
    })

    // ... 返回结果 ...
  }
}
```

### 步骤 3: 创建 Memory 文件（可选）

在 `workspace/memory/` 目录下创建知识库文件：

```bash
mkdir -p workspace/memory
```

创建 `workspace/memory/guide.md`:

```markdown
# CatBot 使用指南

## 配置说明
在设置页面可以配置：
- API Provider（OpenAI / Anthropic）
- API Key
- 模型名称
- Base URL

## 常见问题
- 如何清空会话：点击右上角的垃圾桶图标
- 如何切换主题：在设置中选择明暗主题
```

## 配置说明

### API Key 获取优先级

1. **配置参数** - `config.remote.apiKey`（最高优先级）
2. **Chat 配置** - `workspace/catbot.json` 中的 `model.apiKey`
3. **环境变量** - `process.env.OPENAI_API_KEY`

### Provider 选项

```typescript
// OpenAI (需要 API key)
provider: 'openai'
model: 'text-embedding-3-small'

// Ollama (本地，无需 API key)
provider: 'ollama'
model: 'nomic-embed-text'
remote: { baseUrl: 'http://localhost:11434' }

// Auto (自动选择)
provider: 'auto' // 推荐：有 key 用 OpenAI，否则用 dummy
```

### 数据源选项

```typescript
sources: ['memory']         // 只搜索 memory 文件
sources: ['sessions']       // 只搜索会话历史
sources: ['memory', 'sessions']  // 搜索两者（推荐）
```

## 测试

创建测试文件后，重启应用，在对话中提问：

```
"如何配置API？"
"设置页面在哪里？"
```

查看日志输出：
```
[AgentManager] Memory search initialized
[AgentManager] Found 2 relevant memories
[AgentManager] system total=5234 memory=423
```

## 禁用 Memory Search

如果不需要记忆搜索功能，只需不初始化即可：

```typescript
// 注释掉或移除这部分代码
// if (!this.memorySearch) {
//   this.memorySearch = new MemorySearchEngine(...)
// }
```

## 性能考虑

- **首次启动**: 会索引所有 memory 文件和 session 历史（1-5秒）
- **搜索延迟**: 每次查询 50-200ms
- **缓存**: 相同查询会使用缓存（<1ms）
- **存储空间**: SQLite 数据库通常 <10MB

## 下一步

- 添加更多 memory 文件到 `workspace/memory/`
- 调整 `maxResults` 和 `minScore` 参数
- 尝试不同的 embedding provider
- 根据日志调优性能
