/**
 * RelevanceRanker — uses a small Anthropic model (Haiku) to rank memory entries
 * by relevance to a user query. No embeddings or external APIs required beyond
 * the Anthropic key that's already configured for the main chat.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { MemoryEntry, RankedMemory } from './memory-types'

const DEFAULT_RANKING_MODEL = 'claude-haiku-4-5-20251001'
const SNIPPET_MAX_CHARS = 400
const MAX_TOKENS = 1024

export class RelevanceRanker {
  private client: Anthropic
  private model: string

  constructor(client: Anthropic, model: string = DEFAULT_RANKING_MODEL) {
    this.client = client
    this.model = model
  }

  /**
   * Rank candidate memory entries by relevance to the query.
   * Falls back to original order if the model call fails.
   */
  async rank(
    query: string,
    candidates: MemoryEntry[],
    maxResults: number
  ): Promise<RankedMemory[]> {
    if (candidates.length === 0) return []
    // No need to rank if there's only one candidate or fewer than maxResults
    if (candidates.length <= maxResults) {
      return candidates.map((entry) => ({ entry, score: 1, reason: 'only candidate' }))
    }

    const input = {
      query,
      entries: candidates.map((e, i) => ({
        index: i,
        type: e.frontmatter.type,
        title: e.frontmatter.title,
        age: e.ageLabel,
        snippet: e.content.slice(0, SNIPPET_MAX_CHARS)
      }))
    }

    const systemPrompt = `You are a memory relevance ranker. Given a user query and a list of memory entries, rank the entries by how relevant they are to the query. Return ONLY a JSON array (no explanation, no markdown) like:
[{"index":0,"score":0.9,"reason":"directly relevant"},{"index":2,"score":0.3,"reason":"tangentially related"}]

Rules:
- score is 0.0–1.0
- Only include entries with score > 0
- Sort by score descending
- Return at most ${maxResults} entries`

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(input) }]
      })

      const text =
        response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

      // Extract JSON array from the response (handles potential prose wrapping)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No JSON array in response')

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        index: number
        score: number
        reason: string
      }>

      return parsed
        .filter((r) => r.index >= 0 && r.index < candidates.length && r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map((r) => ({
          entry: candidates[r.index],
          score: r.score,
          reason: r.reason ?? ''
        }))
    } catch (err) {
      console.warn('[RelevanceRanker] Ranking failed, falling back to FTS order:', err)
      // Fall back to original order (already pre-filtered by FTS)
      return candidates.slice(0, maxResults).map((entry, i) => ({
        entry,
        score: 1 - i / candidates.length,
        reason: 'fts fallback'
      }))
    }
  }
}
