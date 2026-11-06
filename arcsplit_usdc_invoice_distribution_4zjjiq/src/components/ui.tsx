import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { useState } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_CHAIN_ID } from '@/contracts/arcSplit'
import { shortAddress, shortHash, type UiStatus } from '@/lib/format'
import type { TxState } from '@/hooks/useTx'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl border p-5 sm:p-6 ${className}`}
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 1px 2px rgba(18,45,69,0.04), 0 12px 32px rgba(18,45,69,0.05)',
      }}
    >
      {children}
    </section>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
      {children}
    </span>
  )
}

type Variant = 'primary' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const styles: Record<Variant, CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff', border: '1px solid transparent' },
    ghost: { background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)' },
    danger: { background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.35)' },
  }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-all enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      style={styles[variant]}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

const PILL: Record<UiStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'var(--accent-hover)', bg: 'rgba(16,97,166,0.10)' },
  paid: { label: 'Paid', color: 'var(--success)', bg: 'rgba(26,128,71,0.12)' },
  cancelled: { label: 'Cancelled', color: 'var(--muted)', bg: 'rgba(107,101,128,0.14)' },
  expired: { label: 'Expired', color: 'var(--warn)', bg: 'rgba(154,106,18,0.14)' },
}

export function StatusPill({ status }: { status: UiStatus }) {
  const { label, color, bg } = PILL[status]
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color, background: bg }}>
      {label}
    </span>
  )
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={buildAddressExplorerUrl(ARC_CHAIN_ID, address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono text-xs hover:underline"
        style={{ color: 'var(--ink-2)' }}
        title={address}
      >
        {label ?? shortAddress(address)}
      </a>
      <button type="button" onClick={copy} aria-label="Copy address" className="rounded p-1" style={{ color: 'var(--subtle)' }}>
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  )
}

export function TxLink({ hash, label = 'View on ArcScan' }: { hash: string; label?: string }) {
  return (
    <a
      href={buildTxExplorerUrl(ARC_CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
      style={{ color: 'var(--accent-hover)' }}
    >
      {label}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

/** Renders the real lifecycle of one transaction. Shows nothing while idle. */
export function TxNotice({ label, state, onDismiss }: { label: string; state: TxState; onDismiss: () => void }) {
  if (state.phase === 'idle') return null
  const copy: Record<Exclude<TxState['phase'], 'idle'>, { title: string; tone: string }> = {
    wallet: { title: `${label}: confirm in your wallet`, tone: 'var(--ink-2)' },
    confirming: { title: `${label}: waiting for confirmation`, tone: 'var(--ink-2)' },
    success: { title: `${label}: confirmed`, tone: 'var(--success)' },
    rejected: { title: `${label}: cancelled`, tone: 'var(--muted)' },
    failed: { title: `${label}: failed`, tone: 'var(--danger)' },
  }
  const { title, tone } = copy[state.phase]
  const busy = state.phase === 'wallet' || state.phase === 'confirming'
  return (
    <div className="rounded-2xl p-3.5 text-sm" style={{ background: 'var(--surface-muted)' }} role="status" aria-live="polite">
      <div className="flex items-center gap-2 font-semibold" style={{ color: tone }}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {title}
      </div>
      {state.error && <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>{state.error}</p>}
      {state.hash && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{shortHash(state.hash)}</span>
          <TxLink hash={state.hash} />
        </div>
      )}
      {!busy && (
        <button type="button" onClick={onDismiss} className="mt-2 text-xs font-semibold" style={{ color: 'var(--subtle)' }}>
          Dismiss
        </button>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded-2xl border bg-white/80 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--focus)]'
export const inputStyle = { borderColor: 'var(--border)', color: 'var(--ink)' } as const
