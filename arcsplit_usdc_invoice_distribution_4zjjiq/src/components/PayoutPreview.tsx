import { formatUsdc } from '@/onchain-money'
import { formatBps } from '@/lib/split'

interface Props {
  payoutA: bigint | null
  payoutB: bigint | null
  bpsA: number | null
  recipientALabel?: string
  recipientBLabel?: string
}

/** Locally computed payouts. Mirrors the contract's arithmetic; nothing here is read from chain. */
export function PayoutPreview({ payoutA, payoutB, bpsA, recipientALabel = 'Recipient A', recipientBLabel = 'Recipient B' }: Props) {
  const ready = payoutA !== null && payoutB !== null && bpsA !== null
  const rows = [
    { label: recipientALabel, share: ready ? formatBps(bpsA) : '--', amount: payoutA },
    { label: recipientBLabel, share: ready ? formatBps(10_000 - bpsA) : '--', amount: payoutB },
  ]
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }} aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>Payout preview</span>
        <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>Computed locally, not onchain</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {row.label} <span className="tabular-nums" style={{ color: 'var(--subtle)' }}>({row.share})</span>
            </span>
            <span className="display text-xl font-bold tabular-nums">
              {row.amount === null ? '--' : formatUsdc(row.amount)}
              <span className="ml-1 text-xs font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
        Recipient A is rounded down to the nearest 0.000001 USDC. Recipient B receives the remainder, so nothing is lost.
      </p>
    </div>
  )
}
