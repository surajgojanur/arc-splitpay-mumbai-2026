import { zeroHash } from 'viem'
import { InvoiceStatus } from '@/contracts/arcSplit'

export const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`
export const shortHash = (value: string) => `${value.slice(0, 10)}...${value.slice(-6)}`
export const hasReference = (hash: string) => hash !== zeroHash

export function formatDateTime(seconds: bigint | number): string {
  return new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export type UiStatus = 'open' | 'paid' | 'cancelled' | 'expired'

/** `expired` is derived: an Open invoice whose deadline has passed. */
export function toUiStatus(status: number, expired: boolean): UiStatus {
  if (status === InvoiceStatus.Paid) return 'paid'
  if (status === InvoiceStatus.Cancelled) return 'cancelled'
  return expired ? 'expired' : 'open'
}
