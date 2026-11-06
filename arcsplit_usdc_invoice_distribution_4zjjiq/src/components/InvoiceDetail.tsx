import { useEffect, useState, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, type Hex } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import { Check, Link2, Loader2 } from 'lucide-react'
import { ARC_CHAIN_ID, ARCSPLIT_ADDRESS, USDC_ADDRESS, InvoiceStatus, arcSplitAbi } from '@/contracts/arcSplit'
import { useInvoice } from '@/hooks/useInvoice'
import { useTx } from '@/hooks/useTx'
import { formatDateTime, hasReference, shortHash, toUiStatus } from '@/lib/format'
import { formatBps } from '@/lib/split'
import { buildShareLink } from '@/lib/share'
import { formatUsdc } from '@/onchain-money'
import { InvoiceSteps, type StepState } from './InvoiceSteps'
import { AddressLink, Button, Card, Label, StatusPill, TxLink, TxNotice } from './ui'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

export function InvoiceDetail({ id }: { id: bigint }) {
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const data = useInvoice(id)
  const approveTx = useTx()
  const settleTx = useTx()
  const cancelTx = useTx()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [link, setLink] = useState<string>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void buildShareLink(`/?invoice=${id.toString()}`).then((url) => live && setLink(url))
    return () => {
      live = false
    }
  }, [id])

  const { invoice, refetchAll } = data

  if (data.isLoading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 className="size-4 animate-spin" aria-hidden /> Reading invoice #{id.toString()} from Arc Testnet...
        </div>
      </Card>
    )
  }
  if (data.notFound) {
    return (
      <Card>
        <p className="font-semibold">Invoice #{id.toString()} does not exist</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Check the invoice number. Ids start at 1.</p>
      </Card>
    )
  }
  if (data.loadError || !invoice) {
    return (
      <Card>
        <p className="font-semibold" style={{ color: 'var(--danger)' }}>Could not load this invoice</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>The network request failed. It will retry automatically on the next refresh.</p>
        <Button variant="ghost" className="mt-3" onClick={() => void refetchAll()}>Retry</Button>
      </Card>
    )
  }

  const status = toUiStatus(invoice.status, data.expired)
  const me = address?.toLowerCase()
  const isPayer = me === invoice.payer.toLowerCase()
  const isCreator = me === invoice.creator.toLowerCase()
  const open = invoice.status === InvoiceStatus.Open
  const payable = open && !data.expired
  const approved = data.allowance !== undefined && data.allowance >= invoice.amount
  const lowBalance = data.balance !== undefined && data.balance < invoice.amount
  const paidHash: Hex | undefined = settleTx.state.phase === 'success' ? settleTx.state.hash : data.events?.paidTx

  const steps: { label: string; state: StepState }[] = (() => {
    if (status === 'paid') return ['Created', 'Approved', 'Settled'].map((label) => ({ label, state: 'done' as const }))
    if (!payable) return [
      { label: 'Created', state: 'done' },
      { label: 'Approved', state: approved ? 'done' : 'stopped' },
      { label: 'Settled', state: 'stopped' },
    ]
    return [
      { label: 'Created', state: 'done' },
      { label: 'Approved', state: approved ? 'done' : 'current' },
      { label: 'Settled', state: approved ? 'current' : 'pending' },
    ]
  })()

  const approve = async () => {
    const contract = ARCSPLIT_ADDRESS
    if (!contract) return
    const receipt = await approveTx.run(() =>
      writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [contract, invoice.amount], chainId: ARC_CHAIN_ID }),
    )
    if (receipt) await refetchAll()
  }
  const settle = async () => {
    const contract = ARCSPLIT_ADDRESS
    if (!contract) return
    const receipt = await settleTx.run(() =>
      writeContractAsync({ address: contract, abi: arcSplitAbi, functionName: 'settleInvoice', args: [id], chainId: ARC_CHAIN_ID }),
    )
    if (receipt) await refetchAll()
  }
  const cancel = async () => {
    const contract = ARCSPLIT_ADDRESS
    if (!contract) return
    setConfirmCancel(false)
    const receipt = await cancelTx.run(() =>
      writeContractAsync({ address: contract, abi: arcSplitAbi, functionName: 'cancelInvoice', args: [id], chainId: ARC_CHAIN_ID }),
    )
    if (receipt) await refetchAll()
  }
  const copyLink = () => {
    if (!link) return
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const [payoutA, payoutB] = data.payouts ?? [undefined, undefined]
  const busy = approveTx.busy || settleTx.busy || cancelTx.busy

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Invoice #{id.toString()}</Label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="display text-4xl font-bold tabular-nums">{formatUsdc(invoice.amount)}</span>
            <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-5 rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
        <Label>{status === 'paid' ? 'Paid out' : 'Payouts'}</Label>
        {[
          { name: 'Recipient A', to: invoice.recipientA, bps: invoice.bpsA, amount: payoutA },
          { name: 'Recipient B', to: invoice.recipientB, bps: invoice.bpsB, amount: payoutB },
        ].map((r) => (
          <div key={r.name} className="mt-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{r.name} <span className="font-normal tabular-nums" style={{ color: 'var(--subtle)' }}>({formatBps(r.bps)})</span></div>
              <AddressLink address={r.to} />
            </div>
            <div className="display text-xl font-bold tabular-nums">
              {r.amount === undefined ? '--' : formatUsdc(r.amount)}
              <span className="ml-1 text-xs font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5"><InvoiceSteps steps={steps} /></div>

      <div className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
        <Row label="Payer"><AddressLink address={invoice.payer} /></Row>
        <Row label="Created by"><AddressLink address={invoice.creator} /></Row>
        <Row label={data.expired && open ? 'Expired' : 'Expires'}><span className="tabular-nums">{formatDateTime(invoice.expiry)}</span></Row>
        {hasReference(invoice.referenceHash) && <Row label="Reference hash"><span className="mono text-xs">{shortHash(invoice.referenceHash)}</span></Row>}
      </div>

      {status === 'paid' && (
        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: 'rgba(26,128,71,0.3)', background: 'rgba(26,128,71,0.07)' }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <Check className="size-4" aria-hidden /> Receipt: settled onchain
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>Paid {formatDateTime(invoice.paidAt)}</p>
          {paidHash ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="mono break-all text-xs" style={{ color: 'var(--ink-2)' }}>{paidHash}</span>
              <TxLink hash={paidHash} />
            </div>
          ) : (
            <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              {data.events === undefined ? 'Looking up the settlement transaction...' : 'Settlement transaction not found in the searched block range.'}
            </p>
          )}
        </div>
      )}
      {status === 'cancelled' && (
        <p className="mt-4 rounded-2xl p-3 text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
          This invoice was cancelled. No funds moved and it can no longer be paid.
          {data.events?.cancelledTx && <> <TxLink hash={data.events.cancelledTx} label="Cancellation tx" /></>}
        </p>
      )}
      {status === 'expired' && (
        <p className="mt-4 rounded-2xl p-3 text-sm" style={{ background: 'rgba(154,106,18,0.1)', color: 'var(--warn)' }}>
          This invoice expired unpaid and can no longer be settled. Cancel it to close it, or create a new one.
        </p>
      )}

      {open && (
        <div className="mt-5 space-y-3">
          {!isConnected ? (
            <ConnectKitButton.Custom>{({ show }) => <Button className="w-full" onClick={show}>Connect wallet</Button>}</ConnectKitButton.Custom>
          ) : payable && isPayer ? (
            <>
              {lowBalance && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  Your USDC balance is below the invoice amount. Use the Get test USDC button in the Arc Studio sidebar.
                </p>
              )}
              {!approved ? (
                <Button className="w-full" loading={approveTx.busy} disabled={busy || lowBalance} onClick={() => void approve()}>
                  Step 1: Approve {formatUsdc(invoice.amount)} USDC
                </Button>
              ) : (
                <Button className="w-full" loading={settleTx.busy} disabled={busy || lowBalance} onClick={() => void settle()}>
                  Step 2: Pay {formatUsdc(invoice.amount)} USDC
                </Button>
              )}
              <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                Approval is limited to this invoice amount and goes to the ArcSplit contract, which sends the USDC directly to both recipients.
              </p>
            </>
          ) : payable ? (
            <p className="rounded-2xl p-3 text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
              Only the designated payer can pay this invoice. Connect <span className="mono text-xs">{invoice.payer}</span> to continue.
            </p>
          ) : null}

          {(isCreator || isPayer) && isConnected && (
            confirmCancel ? (
              <div className="flex items-center gap-2">
                <Button variant="danger" className="flex-1" loading={cancelTx.busy} onClick={() => void cancel()}>Yes, cancel invoice</Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep</Button>
              </div>
            ) : (
              <Button variant="danger" className="w-full" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel invoice</Button>
            )
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <TxNotice label="Approve USDC" state={approveTx.state} onDismiss={approveTx.reset} />
        <TxNotice label="Payment" state={settleTx.state} onDismiss={settleTx.reset} />
        <TxNotice label="Cancel" state={cancelTx.state} onDismiss={cancelTx.reset} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <Button variant="ghost" disabled={!link} onClick={copyLink}>
          {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {copied ? 'Link copied' : 'Copy payment link'}
        </Button>
        {data.events?.createdTx && <TxLink hash={data.events.createdTx} label="Creation tx" />}
      </div>
    </Card>
  )
}
