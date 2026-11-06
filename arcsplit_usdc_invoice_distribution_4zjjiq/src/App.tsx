import { useCallback, useState } from 'react'
import { ARCSPLIT_ADDRESS } from '@/contracts/arcSplit'
import { loadRecent, rememberInvoice } from '@/lib/recent'
import { CreateInvoice } from '@/components/CreateInvoice'
import { DeploymentBanner } from '@/components/DeploymentBanner'
import { Header } from '@/components/Header'
import { InvoicePanel } from '@/components/InvoicePanel'

function invoiceFromUrl(): bigint | undefined {
  const value = new URLSearchParams(window.location.search).get('invoice')
  return value && /^[1-9]\d{0,17}$/.test(value) ? BigInt(value) : undefined
}

export default function App() {
  const [selected, setSelected] = useState<bigint | undefined>(invoiceFromUrl)
  const [recent, setRecent] = useState<string[]>(() => (ARCSPLIT_ADDRESS ? loadRecent(ARCSPLIT_ADDRESS) : []))

  const select = useCallback((id: bigint) => {
    setSelected(id)
    const url = new URL(window.location.href)
    url.searchParams.set('invoice', id.toString())
    window.history.replaceState(null, '', url)
    if (ARCSPLIT_ADDRESS) setRecent(rememberInvoice(ARCSPLIT_ADDRESS, id.toString()))
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-6xl space-y-5 px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <Header />
      <DeploymentBanner />
      <main className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CreateInvoice onCreated={select} />
        <InvoicePanel selected={selected} recent={recent} onSelect={select} />
      </main>
      <footer className="text-center text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Arc Testnet only. Invoice data, status and receipts are read from the chain; only the payout preview is computed locally.
        Testnet USDC has no real value.
      </footer>
    </div>
  )
}
