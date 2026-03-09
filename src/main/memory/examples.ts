/**
 * Memory Search Integration Example
 * Shows how to integrate memory search into AgentManager
 */

import { MemorySearchEngine } from '../memory'
import type { MemorySearchOptions } from '../memory/types'

/**
 * Example: Basic Memory Search Usage
 */
export async function exampleBasicSearch() {
  // Initialize memory search engine
  const memorySearch = new MemorySearchEngine('main', {
    enabled: true,
    provider: 'openai', // or 'ollama', 'auto'
    model: 'text-embedding-3-small',
    remote: {
      apiKey: process.env.OPENAI_API_KEY
    }
  })

  // Initialize (will sync data sources)
  await memorySearch.init()

  // Search for relevant memories
  const results = await memorySearch.search({
    query: 'How do I configure the AI model settings?',
    maxResults: 5,
    minScore: 0.3
  })

  console.log(`Found ${results.length} relevant memories:`)
  for (const result of results) {
    console.log(`- [Score: ${result.score.toFixed(3)}] ${result.chunk.content.slice(0, 100)}...`)
  }

  // Close when done
  memorySearch.close()
}

/**
 * Example: Integration with Agent System Prompt
 */
export async function buildSystemPromptWithMemory(
  sessionId: string,
  userQuery: string,
  basePrompt: string
): Promise<string> {
  // Initialize memory search
  const memorySearch = new MemorySearchEngine(sessionId)
  await memorySearch.init()

  // Search for relevant context
  const searchResults = await memorySearch.search({
    query: userQuery,
    maxResults: 3,
    minScore: 0.4,
    sources: ['memory', 'sessions'], // Search both memory files and conversation history
    sessionId
  })

  // Build context from search results
  if (searchResults.length === 0) {
    memorySearch.close()
    return basePrompt
  }

  const memoryContext = searchResults
    .map((result, idx) => {
      const source = result.chunk.metadata.sourceType === 'sessions'
        ? `Previous Conversation (${result.chunk.metadata.sessionId})`
        : `Memory: ${result.chunk.metadata.source}`

      return `## Relevant Memory ${idx + 1} (Relevance: ${(result.score * 100).toFixed(1)}%)
Source: ${source}
Content:
${result.chunk.content}
`
    })
    .join('\n\n---\n\n')

  const enhancedPrompt = `${basePrompt}

# Relevant Context from Memory

You have access to the following relevant information from your memory and previous conversations:

${memoryContext}

Use this context to provide more informed and contextual responses. If the memory is relevant to the user's query, reference it naturally in your response.
`

  memorySearch.close()
  return enhancedPrompt
}

/**
 * Example: Ollama (Local) Provider Configuration
 */
export function createLocalMemorySearch(sessionId: string): MemorySearchEngine {
  return new MemorySearchEngine(sessionId, {
    enabled: true,
    provider: 'ollama',
    model: 'nomic-embed-text',
    remote: {
      baseUrl: 'http://localhost:11434'
    },
    query: {
      maxResults: 6,
      minScore: 0.3,
      hybrid: {
        enabled: true,
        vectorWeight: 0.6,
        textWeight: 0.4,
        candidateMultiplier: 4,
        mmr: {
          enabled: true, // Enable diversity
          lambda: 0.7
        },
        temporalDecay: {
          enabled: true, // Prefer recent memories
          halfLifeDays: 30
        }
      }
    }
  })
}

/**
 * Example: Manual Sync and Cache Management
 */
export async function exampleSyncAndCache() {
  const memorySearch = new MemorySearchEngine('main')
  await memorySearch.init()

  // Manual sync of all sources
  await memorySearch.syncAll()

  // Search with caching enabled
  console.log('First search (will cache):')
  const results1 = await memorySearch.search({
    query: 'configuration settings',
    maxResults: 5
  })
  console.log(`Found ${results1.length} results`)

  // Same search will use cache
  console.log('Second search (from cache):')
  const results2 = await memorySearch.search({
    query: 'configuration settings',
    maxResults: 5
  })
  console.log(`Found ${results2.length} results (cached)`)

  // Clear cache
  memorySearch.clearCache()
  console.log('Cache cleared')

  memorySearch.close()
}

/**
 * Example: Session-specific Memory Search
 */
export async function exampleSessionMemory() {
  const sessionId = 'user-123-conversation'

  // Create memory search for specific session
  const memorySearch = new MemorySearchEngine(sessionId, {
    enabled: true,
    sources: ['sessions'], // Only search this session's history
    query: {
      maxResults: 10,
      minScore: 0.25
    }
  })

  await memorySearch.init()

  // Search within session history
  const results = await memorySearch.search({
    query: 'what did we discuss about API keys?',
    sessionId
  })

  console.log(`Found ${results.length} relevant messages in session:`)
  for (const result of results) {
    const msg = result.chunk.metadata
    console.log(`- [${new Date(msg.timestamp).toLocaleString()}] ${result.chunk.content.slice(0, 80)}...`)
  }

  memorySearch.close()
}

// Export usage examples
export const MemorySearchExamples = {
  basicSearch: exampleBasicSearch,
  buildPromptWithMemory: buildSystemPromptWithMemory,
  createLocalSearch: createLocalMemorySearch,
  syncAndCache: exampleSyncAndCache,
  sessionMemory: exampleSessionMemory
}
