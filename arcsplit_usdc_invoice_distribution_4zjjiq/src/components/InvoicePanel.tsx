import { useState } from 'react'
import { ReceiptText, Search } from 'lucide-react'
import { ARCSPLIT_ADDRESS } from '@/contracts/arcSplit'
import { InvoiceDetail } from './InvoiceDetail'
import { Button, Card, inputClass, inputStyle, Label } from './ui'

interface Props {
  selected: bigint | undefined
  recent: string[]
  onSelect: (id: bigint) => void
}

export function InvoicePanel({ selected, recent, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const valid = /^[1-9]\d{0,17}$/.test(query)

  return (
    <div className="space-y-5">
      <Card>
        <Label>Find an invoice</Label>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) onSelect(BigInt(query))
          }}
        >
          <input
            className={`${inputClass} tabular-nums`}
            style={inputStyle}
            inputMode="numeric"
            placeholder="Invoice number, e.g. 1"
            value={query}
            onChange={(e) => /^\d*$/.test(e.target.value) && setQuery(e.target.value)}
            aria-label="Invoice number"
          />
          <Button type="submit" variant="ghost" disabled={!valid || !ARCSPLIT_ADDRESS} aria-label="Open invoice">
            <Search className="size-4" aria-hidden /> Open
          </Button>
        </form>
        {recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>Recent in this browser</span>
            {recent.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(BigInt(id))}
                className="min-h-8 rounded-full border px-3 text-xs font-semibold tabular-nums"
                style={{
                  borderColor: 'var(--border)',
                  background: selected?.toString() === id ? 'var(--accent)' : 'var(--surface-strong)',
                  color: selected?.toString() === id ? '#fff' : 'var(--ink-2)',
                }}
              >
                #{id}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected !== undefined && ARCSPLIT_ADDRESS ? (
        <InvoiceDetail key={selected.toString()} id={selected} />
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ReceiptText className="size-8" style={{ color: 'var(--subtle)' }} aria-hidden />
            <p className="font-semibold">No invoice selected</p>
            <p className="max-w-xs text-sm text-pretty" style={{ color: 'var(--muted)' }}>
              {ARCSPLIT_ADDRESS
                ? 'Create an invoice or enter an invoice number. Status, payouts and receipts are read live from Arc Testnet.'
                : 'Invoices appear here once the ArcSplit contract is deployed and configured.'}
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
