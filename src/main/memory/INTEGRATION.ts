/**
 * Memory Search Integration Guide
 * Step-by-step guide to integrate memory search into AgentManager
 */

/**
 * STEP 1: Import Memory Search in AgentManager
 *
 * File: src/main/managers/agent-manager.ts
 */

// Add at the top of agent-manager.ts:
import { MemorySearchEngine } from '../memory'

/**
 * STEP 2: Add Memory Search Instance to AgentManager Class
 */

// Add property to AgentManager class:
export class AgentManager extends EventEmitter {
  // ... existing properties ...
  private memorySearch?: MemorySearchEngine

  // ... rest of class ...
}

/**
 * STEP 3: Initialize Memory Search in Constructor
 */

// In AgentManager constructor:
constructor(options: AgentManagerOptions) {
  super()
  // ... existing initialization ...

  // Initialize memory search (optional - can be lazy loaded)
  // this.memorySearch = new MemorySearchEngine('main', {
  //   enabled: true,
  //   provider: 'auto'
  // })
}

/**
 * STEP 4: Enhance System Prompt with Memory Context
 */

// In AgentManager.run() method, before executing agent loop:
async run(
  sessionId: string,
  message: ChatMessage,
  onUpdate?: (update: AgentUpdate) => void
): Promise<string> {
  const startedAt = Date.now()
  try {
    // ... existing config and prompt loading ...

    // === NEW: Memory Search Integration ===

    // Initialize memory search for this session
    if (!this.memorySearch) {
      this.memorySearch = new MemorySearchEngine(sessionId, {
        enabled: true,
        provider: 'auto', // or 'openai', 'ollama'
        model: 'text-embedding-3-small',
        remote: {
          apiKey: process.env.OPENAI_API_KEY
        },
        sources: ['memory', 'sessions'],
        query: {
          maxResults: 3,
          minScore: 0.4,
          hybrid: {
            enabled: true,
            vectorWeight: 0.7,
            textWeight: 0.3,
            mmr: {
              enabled: true,
              lambda: 0.7
            },
            temporalDecay: {
              enabled: true,
              halfLifeDays: 30
            }
          }
        }
      })
      await this.memorySearch.init()
    }

    // Search for relevant context
    let memoryContext = ''
    if (message.role === 'user') {
      try {
        console.log('[AgentManager] Searching memory for relevant context...')
        const memoryResults = await this.memorySearch.search({
          query: message.content,
          maxResults: 3,
          minScore: 0.4,
          sessionId
        })

        if (memoryResults.length > 0) {
          console.log(`[AgentManager] Found ${memoryResults.length} relevant memories`)

          // Build memory context section
          memoryContext = '\n\n# Relevant Context from Memory\n\n'
          memoryContext += 'You have access to the following relevant information:\n\n'

          memoryResults.forEach((result, idx) => {
            const source = result.chunk.metadata.sourceType === 'sessions'
              ? `Previous Conversation (${result.chunk.metadata.sessionId})`
              : `Memory: ${result.chunk.metadata.source}`

            const timestamp = new Date(result.chunk.metadata.timestamp).toLocaleDateString()

            memoryContext += `## Context ${idx + 1} (Relevance: ${(result.score * 100).toFixed(1)}%)\n`
            memoryContext += `Source: ${source}\n`
            memoryContext += `Date: ${timestamp}\n\n`
            memoryContext += `${result.chunk.content}\n\n`
            memoryContext += '---\n\n'
          })

          memoryContext += 'Use this context to provide more informed responses. Reference it naturally when relevant.\n'
        }
      } catch (error) {
        console.error('[AgentManager] Memory search failed:', error)
        // Continue without memory context
      }
    }

    // === END: Memory Search Integration ===

    // Build enhanced system prompt
    const system = [
      SYSTEM_PROMPT,
      identityPrompt,
      agentsPrompt,
      skillsContext,
      memoryContext // Add memory context here
    ]
      .filter(Boolean)
      .join('\n\n')

    console.log(
      `[AgentManager] system identity=${identityPrompt.length} ` +
      `agents=${agentsPrompt.length} skills=${skillsContext.length} ` +
      `memory=${memoryContext.length} total=${system.length}`
    )

    // ... continue with existing agent loop execution ...
  }
}

/**
 * STEP 5: Optional - Add Memory Search to Settings
 */

// File: src/main/managers/settings-manager.ts
// Add memory search configuration to settings schema:

export interface Settings {
  // ... existing settings ...
  memorySearch?: {
    enabled: boolean
    provider: 'openai' | 'ollama' | 'auto'
    model?: string
    apiKey?: string
    maxResults?: number
    minScore?: number
  }
}

/**
 * STEP 6: Optional - Add IPC Handlers for Memory Search
 */

// File: src/main/handlers/memory-handler.ts
import { ipcMain } from 'electron'
import { MemorySearchEngine } from '../memory'

export function registerMemoryHandlers(memorySearch: MemorySearchEngine): void {
  // Search memory
  ipcMain.handle('memory-search', async (_, query: string, options?: any) => {
    try {
      const results = await memorySearch.search({
        query,
        ...options
      })
      return results
    } catch (error) {
      console.error('Memory search failed:', error)
      throw error
    }
  })

  // Sync memory
  ipcMain.handle('memory-sync', async () => {
    try {
      await memorySearch.syncAll()
      return { success: true }
    } catch (error) {
      console.error('Memory sync failed:', error)
      throw error
    }
  })

  // Clear cache
  ipcMain.handle('memory-clear-cache', async () => {
    memorySearch.clearCache()
    return { success: true }
  })
}

/**
 * STEP 7: Optional - Add Frontend UI for Memory Search
 */

// File: src/preload/index.ts
// Add to API:

export const api = {
  // ... existing APIs ...

  memorySearch: (query: string, options?: any) =>
    ipcRenderer.invoke('memory-search', query, options),

  memorySync: () =>
    ipcRenderer.invoke('memory-sync'),

  memoryClearCache: () =>
    ipcRenderer.invoke('memory-clear-cache')
}

/**
 * STEP 8: Configuration Examples
 */

// Example 1: Basic Setup (Auto Provider)
const basicConfig = {
  enabled: true,
  provider: 'auto', // Uses OpenAI if API key available, else dummy
}

// Example 2: OpenAI Setup
const openaiConfig = {
  enabled: true,
  provider: 'openai',
  model: 'text-embedding-3-small',
  remote: {
    apiKey: process.env.OPENAI_API_KEY
  }
}

// Example 3: Ollama (Local) Setup
const ollamaConfig = {
  enabled: true,
  provider: 'ollama',
  model: 'nomic-embed-text',
  remote: {
    baseUrl: 'http://localhost:11434'
  }
}

// Example 4: Advanced Configuration
const advancedConfig = {
  enabled: true,
  provider: 'openai',
  model: 'text-embedding-3-small',
  remote: {
    apiKey: process.env.OPENAI_API_KEY
  },
  sources: ['memory', 'sessions'],
  extraPaths: [
    './docs',
    './knowledge-base'
  ],
  query: {
    maxResults: 5,
    minScore: 0.35,
    hybrid: {
      enabled: true,
      vectorWeight: 0.6,
      textWeight: 0.4,
      candidateMultiplier: 4,
      mmr: {
        enabled: true,
        lambda: 0.7
      },
      temporalDecay: {
        enabled: true,
        halfLifeDays: 30
      }
    }
  },
  sync: {
    onSessionStart: true,
    onSearch: false,
    watch: true,
    intervalMinutes: 60
  },
  cache: {
    enabled: true,
    maxEntries: 1000
  }
}

/**
 * STEP 9: Testing
 */

// Run test script:
// pnpm tsx src/main/memory/test.ts

// Or test in AgentManager:
const testMemory = async () => {
  const memorySearch = new MemorySearchEngine('test')
  await memorySearch.init()

  const results = await memorySearch.search({
    query: 'test query',
    maxResults: 3
  })

  console.log('Results:', results)
  memorySearch.close()
}

/**
 * STEP 10: Environment Variables
 */

// Add to .env file:
// OPENAI_API_KEY=sk-...

// Or use Ollama locally (no API key needed):
// 1. Install Ollama: https://ollama.ai/
// 2. Pull model: ollama pull nomic-embed-text
// 3. Use provider: 'ollama' in config

export const INTEGRATION_COMPLETE = `
Memory Search Integration Complete! 🎉

Next steps:
1. Set OPENAI_API_KEY environment variable (or use Ollama)
2. Add memory files to workspace/memory/
3. Restart the app
4. Search queries will now have memory context
5. Check console logs for "[AgentManager] Found X relevant memories"

For more details, see src/main/memory/README.md
`
