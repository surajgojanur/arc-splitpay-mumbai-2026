import { BPS_DENOMINATOR } from '@/contracts/arcSplit'
import { parseUsdc } from '@/onchain-money'

const MAX_UINT128 = (1n << 128n) - 1n

/** Parses a USDC amount string into 6-decimal base units, or null when invalid or zero. */
export function tryParseUsdc(value: string): bigint | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const raw = parseUsdc(trimmed)
    return raw > 0n && raw <= MAX_UINT128 ? raw : null
  } catch {
    return null
  }
}

/** "70" or "33.33" to basis points (7000, 3333). Null when invalid or above 100%. */
export function parsePercentToBps(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return bps <= BPS_DENOMINATOR ? bps : null
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

/**
 * Local preview of the contract's split. Same arithmetic as `previewPayouts`: A is floored and
 * B takes the remainder, so the two payouts always add up to the invoice amount.
 */
export function computePayouts(amount: bigint, bpsA: number): { payoutA: bigint; payoutB: bigint } {
  const payoutA = (amount * BigInt(bpsA)) / BigInt(BPS_DENOMINATOR)
  return { payoutA, payoutB: amount - payoutA }
}
