/**
 * Embedding Provider Abstraction
 * Supports multiple embedding services
 */

import Anthropic from '@anthropic-ai/sdk'
import type { EmbeddingRequest, EmbeddingResponse, MemorySearchConfig } from './types'

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>
  getDimension(): number
  getModel(): string
}

/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string
  private model: string
  private baseUrl?: string
  private dimension: number = 1536 // text-embedding-3-small default

  constructor(config: MemorySearchConfig) {
    this.apiKey = config.remote?.apiKey || process.env.OPENAI_API_KEY || ''
    this.model = config.model || 'text-embedding-3-small'
    this.baseUrl = config.remote?.baseUrl

    // Set dimension based on model
    if (this.model.includes('text-embedding-3-small')) {
      this.dimension = 1536
    } else if (this.model.includes('text-embedding-3-large')) {
      this.dimension = 3072
    } else if (this.model.includes('ada-002')) {
      this.dimension = 1536
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required')
    }

    const url = this.baseUrl
      ? `${this.baseUrl}/embeddings`
      : 'https://api.openai.com/v1/embeddings'

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data.map((item: { embedding: number[] }) => item.embedding)
  }

  getDimension(): number {
    return this.dimension
  }

  getModel(): string {
    return this.model
  }
}

/**
 * Ollama Embedding Provider
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model: string
  private baseUrl: string
  private dimension: number = 768 // nomic-embed-text default

  constructor(config: MemorySearchConfig) {
    this.model = config.model || 'nomic-embed-text'
    this.baseUrl = config.remote?.baseUrl || 'http://localhost:11434'
  }

  async embed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = []

    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama embedding failed: ${response.statusText}`)
      }

      const data = await response.json()
      embeddings.push(data.embedding)
    }

    return embeddings
  }

  getDimension(): number {
    return this.dimension
  }

  getModel(): string {
    return this.model
  }
}

/**
 * Mock/Dummy Embedding Provider for testing
 */
export class DummyEmbeddingProvider implements EmbeddingProvider {
  private dimension: number = 384

  async embed(texts: string[]): Promise<number[][]> {
    // Generate random embeddings for testing
    return texts.map(() => {
      const embedding = new Array(this.dimension)
      for (let i = 0; i < this.dimension; i++) {
        embedding[i] = Math.random() * 2 - 1 // Random values between -1 and 1
      }
      return embedding
    })
  }

  getDimension(): number {
    return this.dimension
  }

  getModel(): string {
    return 'dummy'
  }
}

/**
 * Factory to create embedding provider based on config
 */
export function createEmbeddingProvider(config: MemorySearchConfig): EmbeddingProvider {
  const provider = config.provider

  switch (provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config)
    case 'ollama':
      return new OllamaEmbeddingProvider(config)
    case 'auto':
      // Try OpenAI first, fallback to dummy
      if (config.remote?.apiKey || process.env.OPENAI_API_KEY) {
        return new OpenAIEmbeddingProvider(config)
      }
      console.warn('[Memory Search] No API key found, using dummy embeddings')
      return new DummyEmbeddingProvider()
    default:
      console.warn(`[Memory Search] Unknown provider: ${provider}, using dummy`)
      return new DummyEmbeddingProvider()
  }
}

/**
 * Batch embedding with chunking support
 */
export async function embedBatch(
  provider: EmbeddingProvider,
  texts: string[],
  batchSize: number = 100
): Promise<number[][]> {
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings = await provider.embed(batch)
    results.push(...embeddings)
  }

  return results
}
