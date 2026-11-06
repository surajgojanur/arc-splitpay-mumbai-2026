import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { ARCSPLIT_ADDRESS, USDC_ADDRESS } from '@/contracts/arcSplit'
import { AddressLink } from './ui'

/** Tells the truth about whether a real ArcSplit deployment is configured. */
export function DeploymentBanner() {
  if (!ARCSPLIT_ADDRESS) {
    return (
      <div className="flex gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: 'rgba(154,106,18,0.35)', background: 'rgba(154,106,18,0.08)' }}>
        <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--warn)' }} aria-hidden />
        <div style={{ color: 'var(--ink-2)' }}>
          <p className="font-semibold" style={{ color: 'var(--warn)' }}>ArcSplit is not deployed yet</p>
          <p className="mt-1 text-pretty">
            No contract address is configured, so invoices cannot be created or paid. You can still try the payout preview.
            After deployment, set <span className="mono">VITE_ARCSPLIT_ADDRESS</span> in <span className="mono">.env</span> and restart the dev server.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-4 py-3 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--success)' }}>
        <ShieldCheck className="size-4" aria-hidden /> Live on Arc Testnet
      </span>
      <span className="inline-flex items-center gap-2" style={{ color: 'var(--muted)' }}>
        ArcSplit <AddressLink address={ARCSPLIT_ADDRESS} />
      </span>
      <span className="inline-flex items-center gap-2" style={{ color: 'var(--muted)' }}>
        USDC <AddressLink address={USDC_ADDRESS} />
      </span>
    </div>
  )
}
