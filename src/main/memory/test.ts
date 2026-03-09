/**
 * Memory Search Test Script
 * Quick validation of the memory search module
 */

import { MemorySearchEngine } from './memory-search'
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { WORKSPACE_PATH } from '../configs'

async function setupTestData() {
  console.log('[Test] Setting up test data...')

  const memoryDir = join(WORKSPACE_PATH, 'memory')

  try {
    await mkdir(memoryDir, { recursive: true })

    // Create test memory files
    await writeFile(
      join(memoryDir, 'test-guide.md'),
      `# CatBot Configuration Guide

## API Configuration
To configure the AI model:
1. Open Settings
2. Navigate to Model Configuration
3. Enter your API key
4. Select model: claude-3-opus-20240229

## Workspace Setup
The workspace directory stores:
- Session history in sessions/
- Memory files in memory/
- Skills in skills/

## Common Issues
- "API Key missing": Check Settings > Model
- "Session not found": Clear browser cache
`
    )

    await writeFile(
      join(memoryDir, 'development-notes.md'),
      `# Development Notes

## Architecture
- AgentManager: Core agent loop execution
- SessionManager: Conversation persistence
- SkillsManager: Custom tool management

## Adding New Features
1. Create handler in src/main/handlers/
2. Register IPC in main/index.ts
3. Add frontend API in preload/index.ts
4. Implement UI in renderer/

## Testing
Run \`pnpm dev\` to start development server.
`
    )

    console.log('[Test] Test data created successfully')
  } catch (error) {
    console.error('[Test] Failed to create test data:', error)
  }
}

async function testBasicSearch() {
  console.log('\n[Test] Running basic search test...')

  try {
    // Initialize with dummy provider (no API key needed)
    const memorySearch = new MemorySearchEngine('test-session', {
      enabled: true,
      provider: 'auto', // Will use dummy provider if no API key
      sources: ['memory'],
      store: {
        driver: 'sqlite',
        path: join(WORKSPACE_PATH, 'memory', 'test.sqlite'),
        vector: {
          enabled: true
        }
      },
      query: {
        maxResults: 5,
        minScore: 0.1, // Low threshold for testing
        hybrid: {
          enabled: true,
          vectorWeight: 0.7,
          textWeight: 0.3,
          candidateMultiplier: 4,
          mmr: {
            enabled: false
          },
          temporalDecay: {
            enabled: false
          }
        }
      }
    })

    console.log('[Test] Initializing memory search...')
    await memorySearch.init()

    console.log('[Test] Performing search query: "How to configure API settings"')
    const results = await memorySearch.search({
      query: 'How to configure API settings',
      maxResults: 3
    })

    console.log(`[Test] Found ${results.length} results:`)
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      console.log(`\n--- Result ${i + 1} ---`)
      console.log(`Score: ${result.score.toFixed(4)}`)
      console.log(`Source: ${result.chunk.metadata.source}`)
      console.log(`Content Preview: ${result.chunk.content.slice(0, 150)}...`)
    }

    // Test cache
    console.log('\n[Test] Testing cache...')
    const cachedResults = await memorySearch.search({
      query: 'How to configure API settings',
      maxResults: 3
    })
    console.log(`[Test] Cache hit: ${cachedResults.length === results.length}`)

    memorySearch.close()
    console.log('[Test] Basic search test completed successfully')
    return true
  } catch (error) {
    console.error('[Test] Basic search test failed:', error)
    return false
  }
}

async function testTextOnlySearch() {
  console.log('\n[Test] Running text-only search test...')

  try {
    const memorySearch = new MemorySearchEngine('test-session', {
      enabled: true,
      provider: 'auto',
      sources: ['memory'],
      store: {
        driver: 'sqlite',
        path: join(WORKSPACE_PATH, 'memory', 'test.sqlite'),
        vector: {
          enabled: false // Disable vector search
        }
      }
    })

    await memorySearch.init()

    const results = await memorySearch.search({
      query: 'workspace directory',
      maxResults: 3
    })

    console.log(`[Test] Text search found ${results.length} results`)
    for (const result of results) {
      console.log(`- ${result.chunk.content.slice(0, 80)}...`)
    }

    memorySearch.close()
    console.log('[Test] Text-only search test completed')
    return true
  } catch (error) {
    console.error('[Test] Text-only search test failed:', error)
    return false
  }
}

export async function runMemorySearchTests() {
  console.log('='.repeat(60))
  console.log('Memory Search Module Tests')
  console.log('='.repeat(60))

  await setupTestData()

  const results = {
    basicSearch: await testBasicSearch(),
    textOnlySearch: await testTextOnlySearch()
  }

  console.log('\n' + '='.repeat(60))
  console.log('Test Results:')
  console.log('='.repeat(60))
  console.log(`Basic Search: ${results.basicSearch ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Text-Only Search: ${results.textOnlySearch ? '✅ PASS' : '❌ FAIL'}`)

  const allPassed = Object.values(results).every((r) => r === true)
  console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)

  return allPassed
}

// Run tests if executed directly
if (require.main === module) {
  runMemorySearchTests()
    .then((success) => {
      process.exit(success ? 0 : 1)
    })
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}
