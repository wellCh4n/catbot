import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { homedir } from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock
} from '@anthropic-ai/sdk/resources/messages'
import { PromptManager } from './prompt-manager'
import { SettingsManager } from './settings-manager'
import { SessionManager } from './session-manager'
import { SkillsManager } from './skills-manager'
import { MemorySearchEngine } from '../memory'
import { MemoryExtractionAgent } from '../memory/extraction-agent'
import { ChatMessage, AgentUpdate } from '../../common/types'
import { SYSTEM_PROMPT, MEMORY_PROMPT } from '../prompts/prompt'
import { WORKSPACE_PATH } from '../configs'

const execAsync = promisify(exec)

export const TOOLS: Tool[] = [
  {
    name: 'bash',
    description: 'Run a shell command.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    }
  },
  {
    name: 'load_skill',
    description: 'Load skill content by skill name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, limit: { type: 'integer' } },
      required: ['name']
    }
  },
  {
    name: 'read_file',
    description: 'Read file contents.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, limit: { type: 'integer' } },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Replace exact text in file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string' },
        new_text: { type: 'string' }
      },
      required: ['path', 'old_text', 'new_text']
    }
  }
] as unknown as Tool[]

type ToolHandler = (input: unknown) => Promise<string>

export interface AgentManagerOptions {
  promptManager: PromptManager
  settingsManager: SettingsManager
  sessionManager: SessionManager
}

interface AgentLoopOptions {
  client: Anthropic
  model: string
  system: string
  maxTokens?: number
  maxSteps?: number
  stream?: boolean
  onToolUse?: (
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string
  ) => void | Promise<void>
  onToolResult?: (toolName: string, output: string) => void | Promise<void>
  onStreamDelta?: (messageId: string, delta: string) => void
  onStreamEnd?: (messageId: string) => void
}

export class AgentManager extends EventEmitter {
  private promptManager: PromptManager
  private settingsManager: SettingsManager
  private sessionManager: SessionManager
  private skillsManager: SkillsManager
  private memorySearch?: MemorySearchEngine
  private extractionAgent?: MemoryExtractionAgent

  constructor(options: AgentManagerOptions) {
    super()
    this.promptManager = options.promptManager
    this.settingsManager = options.settingsManager
    this.sessionManager = options.sessionManager
    this.skillsManager = new SkillsManager()
  }

  async run(
    sessionId: string,
    message: ChatMessage,
    onUpdate?: (update: AgentUpdate) => void,
    overrideModelName?: string
  ): Promise<string> {
    const startedAt = Date.now()
    try {
      console.log(`[agent-manager] start message=${message.id} session=${sessionId} overrideModel=${overrideModelName || '(none)'}`)

      // 1. Read Config
      const config = await this.settingsManager.read()
      const { provider, apiKey, baseUrl } = config.model
      // Prefer the model passed directly from the chat UI over the config file
      const modelName = overrideModelName || config.model.modelName

      if (!apiKey) {
        throw new Error('API Key is missing in Settings')
      }

      if (provider !== 'anthropic') {
        throw new Error('Agent Loop currently only supports Anthropic provider')
      }

      console.log(
        `[agent-manager] config provider=${provider} model=${modelName || '(default)'} baseUrl=${baseUrl || '(default)'}`
      )

      // 2. Read System Prompt (Identity & Agents)
      const identityPrompt = await this.promptManager.read('IDENTITY.md')
      const agentsPrompt = await this.promptManager.read('AGENTS.md')

      // 3. Initialize Client
      const client = new Anthropic({
        apiKey,
        baseURL: baseUrl || undefined
      })

      // 4. Run Agent Loop

      // Append user message to session
      if (message.role === 'user') {
        await this.sessionManager.append(message, sessionId)
        this.emit('message', { message, sessionId })
      }

      // Load conversation history
      const messages = await this.sessionManager.read(sessionId)

      let currentToolMsgId: string | undefined
      let currentToolUseId: string | undefined

      // Initialize Memory Search (once per agent manager lifetime)
      if (!this.memorySearch) {
        try {
          const memCfg = config.memory
          if (memCfg?.enabled !== false) {
            // Use the same model as the main chat for ranking & extraction
            const memModel = modelName || 'claude-sonnet-4-6'
            this.memorySearch = new MemorySearchEngine()
            await this.memorySearch.init(client, memModel)
            this.extractionAgent = new MemoryExtractionAgent(
              client,
              this.memorySearch.getFileManager(),
              memModel
            )
            console.log('[agent-manager] Memory search initialized')
          }
        } catch (error) {
          console.error('[agent-manager] Failed to initialize memory search:', error)
        }
      }

      // Build memory context (always-included index + per-query ranked results)
      let memoryContext = ''
      if (this.memorySearch) {
        try {
          const memoryIndex = await this.memorySearch.getMemoryIndex()

          if (memoryIndex.trim()) {
            memoryContext = `# Memory\n\n${memoryIndex}`
          }

          if (message.role === 'user') {
            const ranked = await this.memorySearch.search({
              query: message.content,
              maxResults: 3
            })

            if (ranked.length > 0) {
              console.log(`[agent-manager] Found ${ranked.length} relevant memory item(s)`)
              memoryContext += '\n\n## Relevant Memories for This Query\n\n'
              ranked.forEach((r, idx) => {
                const staleTag = r.entry.isStale ? ' ⚠️ possibly outdated — verify before citing' : ''
                memoryContext += `### ${idx + 1}. ${r.entry.frontmatter.title} (${r.entry.frontmatter.type}, ${r.entry.ageLabel}${staleTag})\n\n`
                memoryContext += r.entry.content.trim() + '\n\n'
              })
            }
          }
        } catch (error) {
          console.error('[agent-manager] Memory context failed:', error)
        }
      }

      const skillsSummary = await this.skillsManager.buildSkillsSummary()
      const alwaysSkills = await this.skillsManager.getAlwaysSkills()
      const alwaysSkillsContent = await this.skillsManager.loadSkillsForContext(alwaysSkills)
      const skillsContext = [skillsSummary, alwaysSkillsContent].filter(Boolean).join('\n\n')
      const system = [
        SYSTEM_PROMPT,
        MEMORY_PROMPT,
        identityPrompt,
        agentsPrompt,
        `# Skills
The following skills extend your capabilities. To use a skill, read its SKILL.md file using the load_skill tool.
Skills with available="false" need dependencies installed first - you can try installing them with apt/brew.
All skill executions must be performed strictly within the directory specified by the <location>{path}</location>.
${skillsContext}`,
        memoryContext
      ]
        .filter(Boolean)
        .join('\n\n')

      console.log(
        `[agent-manager] system identity=${identityPrompt.length} agents=${agentsPrompt.length} skills_summary=${skillsSummary.length} always_skills=${alwaysSkills.length} always_skills_content=${alwaysSkillsContent.length} memory=${memoryContext.length} total=${system.length}`
      )
      if (process.env.DEBUG_SYSTEM_PROMPT === '1') {
        console.log('System Prompt:', system)
      }

      const finalMessages = await this.executeLoop(messages, {
        client,
        model: modelName || 'claude-3-opus-20240229',
        system,
        maxSteps: 50, // reasonable default
        stream: config.model.stream ?? false,
        onStreamDelta: (messageId, delta) => {
          const update: AgentUpdate = { type: 'stream_delta', messageId, delta }
          if (onUpdate) onUpdate(update)
          this.emit('update', { update, sessionId })
        },
        onStreamEnd: (messageId) => {
          const update: AgentUpdate = { type: 'stream_end', messageId }
          if (onUpdate) onUpdate(update)
          this.emit('update', { update, sessionId })
        },
        onToolUse: async (toolName, input, toolUseId) => {
          try {
            const inputKeys = input && typeof input === 'object' ? Object.keys(input) : []
            console.log(
              `[agent-manager] tool_use name=${toolName} id=${toolUseId} input_keys=${inputKeys.join(',') || '(none)'}`
            )

            // 1. Tool Use (Assistant)
            const id = randomUUID()
            currentToolMsgId = id
            currentToolUseId = toolUseId
            const timestamp = Date.now()

            const toolUseMsg: ChatMessage = {
              id,
              role: 'assistant',
              content: `Using tool: ${toolName}`,
              timestamp,
              toolUse: { tool: toolName, input, toolUseId }
            }

            // Persist assistant message
            await this.sessionManager.append(toolUseMsg, sessionId)

            // Emit update for UI
            const update: AgentUpdate = {
              type: 'tool_use',
              tool: toolName,
              input,
              toolUseId,
              message: toolUseMsg
            }
            if (onUpdate) onUpdate(update)
            this.emit('update', { update, sessionId })
          } catch (e) {
            console.error('Failed to send tool_use update', e)
          }
        },
        onToolResult: async (toolName, output) => {
          try {
            console.log(
              `[agent-manager] tool_result name=${toolName} bytes=${Buffer.byteLength(output || '', 'utf-8')} error=${output.startsWith('Tool error')}`
            )

            // 2. Tool Result (User)
            // Persist result as a new User message
            const toolResultMsg: ChatMessage = {
              id: randomUUID(),
              role: 'user',
              content: 'Tool Result',
              timestamp: Date.now(),
              toolUse: {
                tool: toolName,
                input: {}, // Placeholder, required by type
                output,
                toolUseId: currentToolUseId
              }
            }
            await this.sessionManager.append(toolResultMsg, sessionId)

            // Emit update for UI
            const update: AgentUpdate = {
              type: 'tool_result',
              tool: toolName,
              output,
              id: currentToolMsgId,
              toolUseId: currentToolUseId
            }
            if (onUpdate) onUpdate(update)
            this.emit('update', { update, sessionId })
          } catch (e) {
            console.error('Failed to send tool_result update', e)
          }
        }
      })

      // Return the last message content
      const lastMessage = finalMessages[finalMessages.length - 1]
      const isStreaming = config.model.stream ?? false
      if (lastMessage.role === 'assistant') {
        let responseText = ''
        if (typeof lastMessage.content === 'string') {
          responseText = lastMessage.content
        } else if (Array.isArray(lastMessage.content)) {
          const textBlock = (lastMessage.content as ContentBlock[]).find(
            (block) => block.type === 'text'
          )
          responseText =
            textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
        }

        if (responseText) {
          const msg: ChatMessage = {
            id: randomUUID(),
            role: 'assistant',
            content: responseText,
            timestamp: Date.now()
          }
          await this.sessionManager.append(msg, sessionId)
          // Only emit message event for non-streaming mode;
          // streaming mode already sent content via stream_delta events
          if (!isStreaming) {
            this.emit('message', { message: msg, sessionId })
          }
          console.log(
            `[agent-manager] done duration_ms=${Date.now() - startedAt} response_chars=${responseText.length}`
          )

          // Background memory extraction — fire-and-forget, never blocks response
          const extractionEnabled = config.memory?.extractionEnabled !== false
          if (this.extractionAgent && extractionEnabled) {
            const recentMessages = await this.sessionManager.read(sessionId)
            this.extractionAgent
              .extract(recentMessages)
              .then(async (result) => {
                if (result.memories.length > 0) {
                  await this.extractionAgent!.save(result)
                  // Re-sync FTS after writing new memories
                  await this.memorySearch?.sync()
                }
              })
              .catch((err) => console.warn('[agent-manager] Background extraction failed:', err))
          }

          return responseText
        }
      }
      console.log(`[agent-manager] done duration_ms=${Date.now() - startedAt} response_chars=0`)
      return ''
    } catch (error: unknown) {
      console.error('Agent Manager Failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      console.log(`[agent-manager] failed duration_ms=${Date.now() - startedAt} message=${msg}`)
      throw new Error(msg || 'Failed to run agent loop')
    }
  }

  private async executeLoop(
    initialMessages: ChatMessage[],
    opts: AgentLoopOptions
  ): Promise<MessageParam[]> {
    // Convert ChatMessage[] to MessageParam[] for Anthropic
    const messages: MessageParam[] = []

    for (let i = 0; i < initialMessages.length; i++) {
      const msg = initialMessages[i]

      if (msg.role === 'user') {
        if (msg.toolUse?.output !== undefined) {
          // This is a tool result message - skip it, will be handled with tool use
          continue
        } else {
          // Standard User Message
          messages.push({ role: 'user', content: msg.content })
        }
      } else if (msg.role === 'assistant') {
        if (msg.toolUse && !msg.toolUse.output) {
          // Assistant Message with Tool Use
          const toolUseId = msg.toolUse.toolUseId || `call_${msg.id.slice(0, 10)}`

          // Build content blocks
          const contentBlocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = []

          // Add text block if content is not empty
          if (msg.content && msg.content.trim()) {
            contentBlocks.push({ type: 'text', text: msg.content })
          }

          // Add tool use block
          contentBlocks.push({
            type: 'tool_use',
            id: toolUseId,
            name: msg.toolUse.tool,
            input: msg.toolUse.input
          })

          messages.push({
            role: 'assistant',
            content: contentBlocks as any
          })

          // Look for the corresponding tool result in the next user messages
          let foundResult = false
          for (let j = i + 1; j < initialMessages.length; j++) {
            const nextMsg = initialMessages[j]
            if (
              nextMsg.role === 'user' &&
              nextMsg.toolUse?.output !== undefined &&
              nextMsg.toolUse?.toolUseId === toolUseId
            ) {
              // Found matching tool result
              messages.push({
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: nextMsg.toolUse.output,
                    is_error: nextMsg.toolUse.output.startsWith('Tool error') || nextMsg.toolUse.output.startsWith('Error:')
                  }
                ]
              })
              foundResult = true
              break
            }
          }

          // If no result found, add an error result to maintain message sequence
          if (!foundResult) {
            console.warn(`[agentLoop] No tool result found for tool use ${toolUseId}, adding error result`)
            messages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolUseId,
                  content: 'Error: Tool result not found in session history',
                  is_error: true
                }
              ]
            })
          }
        } else {
          // Standard Assistant Message (no tool use)
          messages.push({ role: 'assistant', content: msg.content })
        }
      }
    }

    const handlers = this.createToolHandlers(WORKSPACE_PATH)
    const maxSteps = typeof opts.maxSteps === 'number' ? opts.maxSteps : 20
    const maxTokens = typeof opts.maxTokens === 'number' ? opts.maxTokens : 8000

    console.log(`[agentLoop] Converted ${initialMessages.length} chat messages to ${messages.length} API messages`)
    if (process.env.DEBUG_MESSAGES === '1') {
      console.log(`[agentLoop] messages=${JSON.stringify(messages, null, 2)}`)
    }

    // Validate message sequence
    this.validateMessageSequence(messages)

    for (let step = 0; step < maxSteps; step++) {
      console.log(`[agentLoop] step=${step + 1}/${maxSteps} messages=${messages.length} model=${opts.model} stream=${opts.stream}`)

      let response: Anthropic.Messages.Message

      if (opts.stream) {
        // Streaming mode: use create() with stream: true for better proxy compatibility
        const MAX_STREAM_RETRIES = 3
        let streamRetry = 0
        while (true) {
          const streamMsgId = randomUUID()
          try {
            const stream = await opts.client.messages.create({
              model: opts.model,
              system: opts.system,
              messages,
              tools: TOOLS,
              max_tokens: maxTokens,
              stream: true
            })

            // Manually accumulate the streamed response
            const contentBlocks: Array<Record<string, unknown>> = []
            let stopReason: string | null = null
            let usage: Record<string, unknown> = {}
            let messageId = ''
            let messageModel = opts.model
            let messageRole: 'assistant' = 'assistant'

            for await (const event of stream) {
              switch (event.type) {
                case 'message_start':
                  messageId = event.message.id
                  messageModel = event.message.model
                  messageRole = event.message.role
                  usage = event.message.usage as Record<string, unknown>
                  break
                case 'content_block_start':
                  if (event.content_block.type === 'text') {
                    contentBlocks[event.index] = { type: 'text', text: '' }
                  } else if (event.content_block.type === 'tool_use') {
                    contentBlocks[event.index] = {
                      type: 'tool_use',
                      id: event.content_block.id,
                      name: event.content_block.name,
                      input: {}
                    }
                  } else {
                    contentBlocks[event.index] = { ...event.content_block }
                  }
                  break
                case 'content_block_delta':
                  if (event.delta.type === 'text_delta') {
                    const block = contentBlocks[event.index]
                    if (block && block.type === 'text') {
                      block.text = (block.text as string) + event.delta.text
                      opts.onStreamDelta?.(streamMsgId, event.delta.text)
                    }
                  } else if (event.delta.type === 'input_json_delta') {
                    const block = contentBlocks[event.index]
                    if (block && block.type === 'tool_use') {
                      // Accumulate JSON string, parse at end
                      block._inputJson = ((block._inputJson as string) || '') + event.delta.partial_json
                    }
                  }
                  break
                case 'content_block_stop':
                  // Parse accumulated JSON for tool_use blocks
                  {
                    const block = contentBlocks[event.index]
                    if (block?.type === 'tool_use' && block._inputJson) {
                      try {
                        block.input = JSON.parse(block._inputJson as string)
                      } catch {
                        block.input = {}
                      }
                      delete block._inputJson
                    }
                  }
                  break
                case 'message_delta':
                  stopReason = event.delta.stop_reason
                  if (event.usage) {
                    usage = { ...usage, ...event.usage }
                  }
                  break
              }
            }

            opts.onStreamEnd?.(streamMsgId)

            // Build the final Message object
            response = {
              id: messageId,
              type: 'message',
              role: messageRole,
              model: messageModel,
              content: contentBlocks as unknown as Anthropic.Messages.ContentBlock[],
              stop_reason: stopReason as Anthropic.Messages.StopReason,
              stop_sequence: null,
              usage: usage as Anthropic.Messages.Usage
            }
            break // stream succeeded
          } catch (streamError) {
            opts.onStreamEnd?.(streamMsgId)
            if (streamRetry < MAX_STREAM_RETRIES && this.isRetryableNetworkError(streamError)) {
              streamRetry++
              const delay = 1000 * Math.pow(2, streamRetry - 1) // 1s, 2s, 4s
              console.warn(
                `[agentLoop] Stream network error (retry ${streamRetry}/${MAX_STREAM_RETRIES} in ${delay}ms): ${(streamError as Error).message}`
              )
              await new Promise((resolve) => setTimeout(resolve, delay))
              continue
            }
            console.error('[agentLoop] Stream error:', streamError)
            throw streamError
          }
        }
      } else {
        // Non-streaming mode
        response = await opts.client.messages.create({
          model: opts.model,
          system: opts.system,
          messages,
          tools: TOOLS,
          max_tokens: maxTokens
        })
      }

      // Guard against empty or malformed response content
      if (!response.content || !Array.isArray(response.content)) {
        console.warn(`[agentLoop] step=${step + 1} empty or invalid response content, stopping`)
        return messages
      }
      // Filter out undefined entries (can happen with sparse arrays from streaming)
      response.content = response.content.filter((b) => b != null) as typeof response.content

      console.log(
        `[agentLoop] step=${step + 1} stop_reason=${response.stop_reason} content_blocks=${response.content.length}`
      )

      messages.push({
        role: 'assistant',
        content: response.content as unknown as MessageParam['content']
      })

      if (response.stop_reason !== 'tool_use') {
        return messages
      }

      const toolNames = (response.content as ContentBlock[])
        .filter((b) => b.type === 'tool_use')
        .map((b) => (b as ToolUseBlock).name)
      console.log(`[agentLoop] step=${step + 1} tool_use=${toolNames.join(',') || '(none)'}`)

      const results: ToolResultBlockParam[] = []
      for (const block of response.content as ContentBlock[]) {
        if (block.type !== 'tool_use') continue
        const toolUse = block as ToolUseBlock
        const handler = handlers[toolUse.name]
        let output: string
        try {
          await opts.onToolUse?.(toolUse.name, toolUse.input as Record<string, unknown>, toolUse.id)
          output = handler ? await handler(toolUse.input) : `Unknown tool: ${toolUse.name}`
          await opts.onToolResult?.(toolUse.name, output)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          output = `Tool error (${toolUse.name}): ${msg}`
          opts.onToolResult?.(toolUse.name, output)
        }
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: output,
          is_error: output.startsWith('Tool error')
        })
      }
      messages.push({ role: 'user', content: results })
    }

    return messages
  }

  private createToolHandlers(workspacePath?: string): Record<string, ToolHandler> {
    const skillsManager = new SkillsManager()

    return {
      bash: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const command = typeof parsed.command === 'string' ? parsed.command : ''
        if (!command.trim()) return ''

        const DANGEROUS_COMMANDS = ['rm -rf /', 'sudo', 'shutdown', 'reboot', '> /dev/']
        if (DANGEROUS_COMMANDS.some((d) => command.includes(d))) {
          return 'Error: Dangerous command blocked'
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: workspacePath,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024
          })
          const output = (stdout || '') + (stderr ? `\n${stderr}` : '')
          const trimmed = output.trim()
          return trimmed ? trimmed.slice(0, 50000) : '(no output)'
        } catch (err) {
          const error = err as Error & {
            code?: string | number
            stdout?: string
            stderr?: string
            killed?: boolean
          }

          if (error.killed || error.code === 'ETIMEDOUT') {
            return 'Error: Timeout (120s)'
          }

          const msg = error.message ? error.message.split('\n')[0] : 'Command failed'
          const output = (error.stdout || '') + (error.stderr || '')
          return `Error: ${msg}\n${output}`.trim().slice(0, 50000)
        }
      },
      load_skill: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const name = typeof parsed.name === 'string' ? parsed.name : ''
        if (!name.trim()) throw new Error('name is required')

        const content = await skillsManager.loadSkill(name)
        if (!content) throw new Error(`Skill not found: ${name}`)

        const limit = typeof parsed.limit === 'number' ? parsed.limit : 50000
        return this.limitText(content, limit)
      },
      read_file: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const filePath = this.resolveWorkspacePath(
          typeof parsed.path === 'string' ? parsed.path : '',
          WORKSPACE_PATH,
          WORKSPACE_PATH
        )
        const content = await readFile(filePath, 'utf-8')
        const limit = typeof parsed.limit === 'number' ? parsed.limit : 2000
        return this.limitText(content, limit)
      },
      write_file: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const filePath = this.resolveWorkspacePath(
          typeof parsed.path === 'string' ? parsed.path : '',
          WORKSPACE_PATH,
          WORKSPACE_PATH
        )
        const content = typeof parsed.content === 'string' ? parsed.content : ''
        await writeFile(filePath, content, 'utf-8')
        return 'ok'
      },
      edit_file: async (input: unknown) => {
        const parsed =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
        const filePath = this.resolveWorkspacePath(
          typeof parsed.path === 'string' ? parsed.path : '',
          WORKSPACE_PATH,
          WORKSPACE_PATH
        )
        const oldText = typeof parsed.old_text === 'string' ? parsed.old_text : ''
        const newText = typeof parsed.new_text === 'string' ? parsed.new_text : ''
        const content = await readFile(filePath, 'utf-8')
        if (!oldText) throw new Error('old_text is required')
        const next = content.includes(oldText) ? content.split(oldText).join(newText) : content
        await writeFile(filePath, next, 'utf-8')
        return content === next ? 'no_change' : 'ok'
      }
    }
  }

  private resolveWorkspacePath(
    inputPath: string,
    workspacePath?: string,
    allowedDir?: string
  ): string {
    // 1. Expand user home directory (~)
    let p = inputPath
    if (p.startsWith('~')) {
      p = join(homedir(), p.slice(1))
    }

    // 2. Resolve absolute path
    let resolvedPath: string
    if (!isAbsolute(p) && workspacePath) {
      resolvedPath = resolve(workspacePath, p)
    } else {
      resolvedPath = resolve(p)
    }

    // 3. Enforce directory restriction
    if (allowedDir) {
      const allowed = resolve(allowedDir)
      const rel = relative(allowed, resolvedPath)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Path ${inputPath} is outside allowed directory ${allowedDir}`)
      }
    }

    return resolvedPath
  }

  private limitText(text: string, limit: number): string {
    if (limit <= 0) return ''
    return text.length > limit ? text.slice(0, limit) : text
  }

  private isRetryableNetworkError(err: unknown): boolean {
    if (!(err instanceof Error)) return false
    const msg = err.message.toLowerCase()
    const cause = (err as NodeJS.ErrnoException).cause
    const causeCode =
      cause && typeof cause === 'object' && 'code' in cause ? (cause as { code: string }).code : ''
    return (
      msg === 'terminated' ||
      causeCode === 'UND_ERR_SOCKET' ||
      msg.includes('socket') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('network')
    )
  }

  /**
   * Validate message sequence for Anthropic API compatibility
   * Ensures messages alternate between user and assistant, and tool calls are properly paired
   */
  private validateMessageSequence(messages: MessageParam[]): void {
    if (messages.length === 0) return

    // First message must be user — prepend an empty user message if not
    if (messages[0].role !== 'user') {
      console.warn('[agentLoop] First message is not user, prepending empty user message')
      messages.unshift({ role: 'user', content: '...' })
    }

    // Merge consecutive same-role messages to satisfy alternating requirement
    let i = 1
    while (i < messages.length) {
      if (messages[i].role === messages[i - 1].role) {
        console.warn(
          `[agentLoop] Message ${i}: Merging consecutive ${messages[i].role} messages`
        )
        const prev = messages[i - 1]
        const curr = messages[i]

        // Merge content: convert both to arrays and concatenate
        const prevContent = Array.isArray(prev.content)
          ? prev.content
          : [{ type: 'text' as const, text: String(prev.content) }]
        const currContent = Array.isArray(curr.content)
          ? curr.content
          : [{ type: 'text' as const, text: String(curr.content) }]

        prev.content = [...prevContent, ...currContent] as MessageParam['content']
        messages.splice(i, 1)
      } else {
        i++
      }
    }

    // Check tool_use/tool_result pairing
    for (let j = 0; j < messages.length; j++) {
      const msg = messages[j]
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const hasToolUse = msg.content.some((block: any) => block.type === 'tool_use')
        if (hasToolUse) {
          const nextMsg = messages[j + 1]
          if (!nextMsg || nextMsg.role !== 'user') {
            console.error(
              `[agentLoop] Message ${j}: Assistant has tool_use but next message is not user`
            )
            throw new Error('Invalid message sequence: tool_use must be followed by user message with tool_result')
          }
          if (Array.isArray(nextMsg.content)) {
            const hasToolResult = nextMsg.content.some((block: any) => block.type === 'tool_result')
            if (!hasToolResult) {
              console.error(
                `[agentLoop] Message ${j + 1}: User message after tool_use does not contain tool_result`
              )
              throw new Error('Invalid message sequence: user message after tool_use must contain tool_result')
            }
          }
        }
      }
    }

    console.log('[agentLoop] Message sequence validation passed')
  }
}
