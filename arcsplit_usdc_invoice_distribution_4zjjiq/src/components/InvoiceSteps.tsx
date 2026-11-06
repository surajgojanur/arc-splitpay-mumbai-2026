import { Check } from 'lucide-react'

export type StepState = 'done' | 'current' | 'pending' | 'stopped'

/** Progress derived from real contract and token state, never from timers. */
export function InvoiceSteps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="flex items-start justify-between gap-2" aria-label="Invoice progress">
      {steps.map((step, i) => {
        const done = step.state === 'done'
        const current = step.state === 'current'
        return (
          <li key={step.label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <span
              className="flex size-7 items-center justify-center rounded-full text-xs font-bold tabular-nums"
              style={{
                background: done ? 'var(--success)' : current ? 'var(--accent)' : 'var(--surface-muted)',
                color: done || current ? '#fff' : 'var(--subtle)',
                opacity: step.state === 'stopped' ? 0.5 : 1,
              }}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className="text-xs font-semibold" style={{ color: done || current ? 'var(--ink)' : 'var(--subtle)' }}>{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
