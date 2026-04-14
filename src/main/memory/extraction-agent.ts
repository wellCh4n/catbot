/**
 * MemoryExtractionAgent — runs asynchronously after the main agent loop to
 * extract saveable content from the conversation. Fire-and-forget; never
 * blocks the user's response.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from '../../common/types'
import type { ExtractionResult, MemoryType } from './memory-types'
import type { MemoryFileManager } from './memory-file-manager'

const DEFAULT_EXTRACTION_MODEL = 'claude-haiku-4-5-20251001'
const MAX_MESSAGES = 10
const MAX_TOKENS = 2048

export class MemoryExtractionAgent {
  private client: Anthropic
  private model: string
  private fileManager: MemoryFileManager

  constructor(client: Anthropic, fileManager: MemoryFileManager, model?: string) {
    this.client = client
    this.fileManager = fileManager
    this.model = model ?? DEFAULT_EXTRACTION_MODEL
  }

  /**
   * Analyse recent messages and extract anything worth saving to long-term memory.
   * Returns an empty result if nothing meaningful is found.
   */
  async extract(messages: ChatMessage[]): Promise<ExtractionResult> {
    // Only look at the last N messages to keep the prompt small
    const recent = messages
      .filter((m) => !m.toolUse && m.content?.trim())
      .slice(-MAX_MESSAGES)

    if (recent.length === 0) return { memories: [] }

    const conversation = recent
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n')

    const systemPrompt = `You are a memory extraction assistant for an AI coding agent. Analyze the conversation and extract any information worth preserving in long-term memory.

Memory categories:
- user: user preferences, personal info, communication style, skill level
- feedback: corrections or validated patterns the user gave the agent
- project: project-specific facts, architecture decisions, conventions, goals
- reference: reusable knowledge, solutions, patterns worth keeping

Rules:
- DO NOT save: code snippets that can be grep'd, file paths, transient task details, sensitive credentials
- DO save: insights, preferences, conventions, decisions that are hard to re-derive
- If nothing is worth saving, return {"memories":[]}
- Return ONLY valid JSON, no markdown fences, no explanation

Output format:
{"memories":[{"type":"user|feedback|project|reference","title":"short title","content":"concise markdown content"}]}`

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: conversation }]
      })

      const text =
        response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

      // Extract and repair JSON from response
      const parsed = this.parseJsonSafe<ExtractionResult>(text)
      if (!parsed) return { memories: [] }
      const valid = (parsed.memories ?? []).filter(
        (m) =>
          m.type &&
          ['user', 'feedback', 'project', 'reference'].includes(m.type) &&
          m.title?.trim() &&
          m.content?.trim()
      )

      if (valid.length > 0) {
        console.log(`[ExtractionAgent] Extracted ${valid.length} memory item(s)`)
      }

      return { memories: valid }
    } catch (err) {
      console.warn('[ExtractionAgent] Extraction failed:', err)
      return { memories: [] }
    }
  }

  /**
   * Persist the extracted memories to topic files and rebuild the index.
   */
  /**
   * Try to parse JSON from LLM output, auto-repairing common formatting issues.
   */
  private parseJsonSafe<T>(raw: string): T | null {
    // Strip markdown fences
    let text = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()

    // Extract the outermost JSON object
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    text = match[0]

    // 1st attempt: parse as-is
    try {
      return JSON.parse(text) as T
    } catch {
      // continue to repair
    }

    // Repair common LLM issues:
    let repaired = text
      // Trailing commas before } or ]
      .replace(/,\s*([}\]])/g, '$1')
      // Single quotes → double quotes (only around property keys and string values)
      .replace(/'/g, '"')
      // Unescaped newlines inside string values
      .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
      // Control characters
      .replace(/[\x00-\x1F\x7F]/g, (ch) => (ch === '\n' || ch === '\r' || ch === '\t' ? ch : ''))

    // 2nd attempt: parse repaired
    try {
      return JSON.parse(repaired) as T
    } catch {
      // continue
    }

    // 3rd attempt: try to extract a JSON array of objects if the outer wrapper is broken
    const arrMatch = repaired.match(/\[[\s\S]*\]/)
    if (arrMatch) {
      try {
        const memories = JSON.parse(arrMatch[0])
        return { memories } as T
      } catch {
        // give up
      }
    }

    console.warn('[ExtractionAgent] Failed to parse JSON after repair, skipping extraction')
    return null
  }

  async save(result: ExtractionResult): Promise<void> {
    for (const mem of result.memories) {
      try {
        const filename = await this.fileManager.writeTopicFile({
          type: mem.type as MemoryType,
          title: mem.title,
          content: mem.content
        })
        console.log(`[ExtractionAgent] Saved memory: ${filename}`)
      } catch (err) {
        console.warn(`[ExtractionAgent] Failed to save memory "${mem.title}":`, err)
      }
    }
  }
}
