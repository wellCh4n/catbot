/**
 * Memory Search Configuration Resolver
 */

import { join } from 'path'
import { WORKSPACE_PATH } from '../configs'
import type { MemorySearchConfig, MemorySource } from './types'

// Default models for each provider
const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small'
const DEFAULT_GEMINI_MODEL = 'gemini-embedding-001'
const DEFAULT_VOYAGE_MODEL = 'voyage-4-large'
const DEFAULT_MISTRAL_MODEL = 'mistral-embed'
const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text'

// Default configuration values
const DEFAULT_CHUNK_TOKENS = 400
const DEFAULT_CHUNK_OVERLAP = 80
const DEFAULT_WATCH_DEBOUNCE_MS = 1500
const DEFAULT_SESSION_DELTA_BYTES = 100_000
const DEFAULT_SESSION_DELTA_MESSAGES = 50
const DEFAULT_MAX_RESULTS = 6
const DEFAULT_MIN_SCORE = 0.35
const DEFAULT_HYBRID_ENABLED = true
const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.7
const DEFAULT_HYBRID_TEXT_WEIGHT = 0.3
const DEFAULT_HYBRID_CANDIDATE_MULTIPLIER = 4
const DEFAULT_MMR_ENABLED = false
const DEFAULT_MMR_LAMBDA = 0.7
const DEFAULT_TEMPORAL_DECAY_ENABLED = false
const DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS = 30
const DEFAULT_CACHE_ENABLED = true
const DEFAULT_SOURCES: MemorySource[] = ['memory']

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function normalizeSources(
  sources: MemorySource[] | undefined,
  sessionMemoryEnabled: boolean
): MemorySource[] {
  const normalized = new Set<MemorySource>()
  const input = sources?.length ? sources : DEFAULT_SOURCES

  for (const source of input) {
    if (source === 'memory') {
      normalized.add('memory')
    }
    if (source === 'sessions' && sessionMemoryEnabled) {
      normalized.add('sessions')
    }
  }

  if (normalized.size === 0) {
    normalized.add('memory')
  }

  return Array.from(normalized)
}

function resolveStorePath(sessionId: string, rawPath?: string): string {
  const fallback = join(WORKSPACE_PATH, 'memory', `${sessionId}.sqlite`)
  if (!rawPath) {
    return fallback
  }

  const withToken = rawPath.includes('{sessionId}')
    ? rawPath.replaceAll('{sessionId}', sessionId)
    : rawPath

  return withToken
}

export function resolveMemorySearchConfig(
  sessionId: string = 'main',
  overrides?: Partial<MemorySearchConfig>
): MemorySearchConfig {
  const enabled = overrides?.enabled ?? true
  const sessionMemory = false // Can be made configurable later
  const provider = overrides?.provider ?? 'auto'

  const hasRemoteConfig = Boolean(
    overrides?.remote?.baseUrl || overrides?.remote?.apiKey || overrides?.remote?.headers
  )

  const includeRemote =
    hasRemoteConfig ||
    provider === 'openai' ||
    provider === 'gemini' ||
    provider === 'voyage' ||
    provider === 'mistral' ||
    provider === 'ollama' ||
    provider === 'auto'

  const remote = includeRemote
    ? {
        baseUrl: overrides?.remote?.baseUrl,
        apiKey: overrides?.remote?.apiKey,
        headers: overrides?.remote?.headers
      }
    : undefined

  const fallback = overrides?.fallback ?? 'none'

  const modelDefault =
    provider === 'gemini'
      ? DEFAULT_GEMINI_MODEL
      : provider === 'openai'
        ? DEFAULT_OPENAI_MODEL
        : provider === 'voyage'
          ? DEFAULT_VOYAGE_MODEL
          : provider === 'mistral'
            ? DEFAULT_MISTRAL_MODEL
            : provider === 'ollama'
              ? DEFAULT_OLLAMA_MODEL
              : DEFAULT_OPENAI_MODEL

  const model = overrides?.model ?? modelDefault

  const sources = normalizeSources(overrides?.sources, sessionMemory)

  const extraPaths = Array.from(
    new Set([...(overrides?.extraPaths ?? [])].map((p) => p.trim()).filter(Boolean))
  )

  const vector = {
    enabled: overrides?.store?.vector?.enabled ?? true,
    extensionPath: overrides?.store?.vector?.extensionPath
  }

  const store = {
    driver: 'sqlite' as const,
    path: resolveStorePath(sessionId, overrides?.store?.path),
    vector
  }

  const chunking = {
    tokens: overrides?.chunking?.tokens ?? DEFAULT_CHUNK_TOKENS,
    overlap: overrides?.chunking?.overlap ?? DEFAULT_CHUNK_OVERLAP
  }

  const sync = {
    onSessionStart: overrides?.sync?.onSessionStart ?? true,
    onSearch: overrides?.sync?.onSearch ?? true,
    watch: overrides?.sync?.watch ?? true,
    watchDebounceMs: overrides?.sync?.watchDebounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS,
    intervalMinutes: overrides?.sync?.intervalMinutes ?? 0,
    sessions: {
      deltaBytes: overrides?.sync?.sessions?.deltaBytes ?? DEFAULT_SESSION_DELTA_BYTES,
      deltaMessages: overrides?.sync?.sessions?.deltaMessages ?? DEFAULT_SESSION_DELTA_MESSAGES
    }
  }

  const query = {
    maxResults: overrides?.query?.maxResults ?? DEFAULT_MAX_RESULTS,
    minScore: overrides?.query?.minScore ?? DEFAULT_MIN_SCORE
  }

  const hybrid = {
    enabled: overrides?.query?.hybrid?.enabled ?? DEFAULT_HYBRID_ENABLED,
    vectorWeight: overrides?.query?.hybrid?.vectorWeight ?? DEFAULT_HYBRID_VECTOR_WEIGHT,
    textWeight: overrides?.query?.hybrid?.textWeight ?? DEFAULT_HYBRID_TEXT_WEIGHT,
    candidateMultiplier:
      overrides?.query?.hybrid?.candidateMultiplier ?? DEFAULT_HYBRID_CANDIDATE_MULTIPLIER,
    mmr: {
      enabled: overrides?.query?.hybrid?.mmr?.enabled ?? DEFAULT_MMR_ENABLED,
      lambda: overrides?.query?.hybrid?.mmr?.lambda ?? DEFAULT_MMR_LAMBDA
    },
    temporalDecay: {
      enabled:
        overrides?.query?.hybrid?.temporalDecay?.enabled ?? DEFAULT_TEMPORAL_DECAY_ENABLED,
      halfLifeDays:
        overrides?.query?.hybrid?.temporalDecay?.halfLifeDays ??
        DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS
    }
  }

  const cache = {
    enabled: overrides?.cache?.enabled ?? DEFAULT_CACHE_ENABLED,
    maxEntries: overrides?.cache?.maxEntries
  }

  // Normalize values
  const overlap = clampNumber(chunking.overlap, 0, Math.max(0, chunking.tokens - 1))
  const minScore = clampNumber(query.minScore, 0, 1)
  const vectorWeight = clampNumber(hybrid.vectorWeight, 0, 1)
  const textWeight = clampNumber(hybrid.textWeight, 0, 1)
  const sum = vectorWeight + textWeight
  const normalizedVectorWeight = sum > 0 ? vectorWeight / sum : DEFAULT_HYBRID_VECTOR_WEIGHT
  const normalizedTextWeight = sum > 0 ? textWeight / sum : DEFAULT_HYBRID_TEXT_WEIGHT
  const candidateMultiplier = clampInt(hybrid.candidateMultiplier, 1, 20)
  const temporalDecayHalfLifeDays = Math.max(
    1,
    Math.floor(
      Number.isFinite(hybrid.temporalDecay.halfLifeDays)
        ? hybrid.temporalDecay.halfLifeDays
        : DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS
    )
  )
  const deltaBytes = clampInt(sync.sessions.deltaBytes, 0, Number.MAX_SAFE_INTEGER)
  const deltaMessages = clampInt(sync.sessions.deltaMessages, 0, Number.MAX_SAFE_INTEGER)

  return {
    enabled,
    sources,
    extraPaths,
    provider,
    remote,
    fallback,
    model,
    local: overrides?.local,
    store,
    chunking: { tokens: Math.max(1, chunking.tokens), overlap },
    sync: {
      ...sync,
      sessions: {
        deltaBytes,
        deltaMessages
      }
    },
    query: {
      ...query,
      minScore,
      hybrid: {
        enabled: Boolean(hybrid.enabled),
        vectorWeight: normalizedVectorWeight,
        textWeight: normalizedTextWeight,
        candidateMultiplier,
        mmr: {
          enabled: Boolean(hybrid.mmr.enabled),
          lambda: Number.isFinite(hybrid.mmr.lambda)
            ? Math.max(0, Math.min(1, hybrid.mmr.lambda))
            : DEFAULT_MMR_LAMBDA
        },
        temporalDecay: {
          enabled: Boolean(hybrid.temporalDecay.enabled),
          halfLifeDays: temporalDecayHalfLifeDays
        }
      }
    },
    cache: {
      enabled: Boolean(cache.enabled),
      maxEntries:
        typeof cache.maxEntries === 'number' && Number.isFinite(cache.maxEntries)
          ? Math.max(1, Math.floor(cache.maxEntries))
          : undefined
    }
  }
}

export function getDefaultConfig(sessionId: string = 'main'): MemorySearchConfig {
  return resolveMemorySearchConfig(sessionId)
}
