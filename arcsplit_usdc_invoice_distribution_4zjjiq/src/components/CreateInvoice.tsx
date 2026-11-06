import { useMemo, useState, type ReactNode } from 'react'
import { isAddress, keccak256, parseEventLogs, toBytes, zeroHash, type Address } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { ARC_CHAIN_ID, ARCSPLIT_ADDRESS, arcSplitAbi } from '@/contracts/arcSplit'
import { useTx } from '@/hooks/useTx'
import { computePayouts, parsePercentToBps, tryParseUsdc } from '@/lib/split'
import { PayoutPreview } from './PayoutPreview'
import { Button, Card, inputClass, inputStyle, Label, TxNotice } from './ui'

const DURATIONS = [
  { key: '1h', label: '1 hour', seconds: 3_600 },
  { key: '24h', label: '24 hours', seconds: 86_400 },
  { key: '7d', label: '7 days', seconds: 604_800 },
  { key: '30d', label: '30 days', seconds: 2_592_000 },
] as const

const EXAMPLE_SPLITS = ['50', '70', '80'] as const

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between">
        <Label>{label}</Label>
        {hint && <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{hint}</span>}
      </span>
      {children}
      {error && <span className="block text-xs" style={{ color: 'var(--danger)' }}>{error}</span>}
    </label>
  )
}

export function CreateInvoice({ onCreated }: { onCreated: (id: bigint) => void }) {
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const tx = useTx()

  const [payer, setPayer] = useState('')
  const [recipientA, setRecipientA] = useState('')
  const [recipientB, setRecipientB] = useState('')
  const [amount, setAmount] = useState('')
  const [percentA, setPercentA] = useState('70')
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]['key']>('24h')
  const [reference, setReference] = useState('')
  const [touched, setTouched] = useState(false)
  const [createdId, setCreatedId] = useState<bigint | null>(null)

  const amountRaw = tryParseUsdc(amount)
  const bpsA = parsePercentToBps(percentA)
  const bpsB = bpsA === null ? null : 10_000 - bpsA
  const payouts = useMemo(
    () => (amountRaw !== null && bpsA !== null ? computePayouts(amountRaw, bpsA) : null),
    [amountRaw, bpsA],
  )

  const errors = {
    payer: !isAddress(payer) ? 'Enter a valid payer address.' : payer.toLowerCase() === ARCSPLIT_ADDRESS?.toLowerCase() ? 'The contract cannot be the payer.' : null,
    recipientA: !isAddress(recipientA) ? 'Enter a valid address.' : null,
    recipientB: !isAddress(recipientB)
      ? 'Enter a valid address.'
      : recipientA.toLowerCase() === recipientB.toLowerCase()
        ? 'Recipients must be different addresses.'
        : null,
    amount: amountRaw === null ? 'Enter an amount above 0, up to 6 decimals.' : null,
    split:
      bpsA === null || bpsA === 0 || bpsA === 10_000
        ? 'Each recipient needs a share between 0.01% and 99.99%.'
        : payouts && (payouts.payoutA === 0n || payouts.payoutB === 0n)
          ? 'Amount is too small: one recipient would receive 0 USDC.'
          : null,
  }
  const valid = Object.values(errors).every((e) => e === null)
  const show = (key: keyof typeof errors) => (touched ? errors[key] : null)

  const submit = async () => {
    setTouched(true)
    const contract = ARCSPLIT_ADDRESS
    if (!valid || !contract || amountRaw === null || bpsA === null || bpsB === null) return
    const duration_ = DURATIONS.find((d) => d.key === duration) ?? DURATIONS[1]
    const expiry = BigInt(Math.floor(Date.now() / 1000) + duration_.seconds)
    const referenceHash = reference.trim() ? keccak256(toBytes(reference.trim())) : zeroHash
    const receipt = await tx.run(() =>
      writeContractAsync({
        address: contract,
        abi: arcSplitAbi,
        functionName: 'createInvoice',
        args: [payer as Address, recipientA as Address, recipientB as Address, amountRaw, bpsA, bpsB, expiry, referenceHash],
        chainId: ARC_CHAIN_ID,
      }),
    )
    if (!receipt) return
    const [event] = parseEventLogs({ abi: arcSplitAbi, logs: receipt.logs, eventName: 'InvoiceCreated' })
    if (event) {
      setCreatedId(event.args.id)
      onCreated(event.args.id)
    }
  }

  const useMine = (set: (v: string) => void) =>
    address ? (
      <button type="button" onClick={() => set(address)} className="text-[11px] font-semibold" style={{ color: 'var(--accent-hover)' }}>
        Use my wallet
      </button>
    ) : null

  const deployed = ARCSPLIT_ADDRESS !== undefined

  return (
    <Card>
      <div className="mb-5">
        <h2 className="display text-2xl font-bold">Create invoice</h2>
        <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          The payer settles once. The contract sends USDC straight to both recipients in the same transaction.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Payer" hint="Only this address can pay" error={show('payer')}>
          <input className={inputClass} style={inputStyle} placeholder="0x..." value={payer} onChange={(e) => setPayer(e.target.value.trim())} spellCheck={false} autoComplete="off" />
          <div className="flex justify-end">{useMine(setPayer)}</div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recipient A" error={show('recipientA')}>
            <input className={inputClass} style={inputStyle} placeholder="0x..." value={recipientA} onChange={(e) => setRecipientA(e.target.value.trim())} spellCheck={false} autoComplete="off" />
            <div className="flex justify-end">{useMine(setRecipientA)}</div>
          </Field>
          <Field label="Recipient B" error={show('recipientB')}>
            <input className={inputClass} style={inputStyle} placeholder="0x..." value={recipientB} onChange={(e) => setRecipientB(e.target.value.trim())} spellCheck={false} autoComplete="off" />
            <div className="flex justify-end">{useMine(setRecipientB)}</div>
          </Field>
        </div>

        <Field label="Invoice amount" hint="USDC" error={show('amount')}>
          <input
            className={`${inputClass} display text-2xl font-bold tabular-nums`}
            style={inputStyle}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setAmount(e.target.value)}
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Split</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>Example splits</span>
              {EXAMPLE_SPLITS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPercentA(p)}
                  className="min-h-8 rounded-full border px-2.5 text-xs font-semibold tabular-nums"
                  style={{ borderColor: 'var(--border)', background: percentA === p ? 'var(--accent)' : 'var(--surface-strong)', color: percentA === p ? '#fff' : 'var(--ink-2)' }}
                >
                  {p}/{100 - Number(p)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Recipient A %</span>
              <input className={`${inputClass} tabular-nums`} style={inputStyle} inputMode="decimal" value={percentA} onChange={(e) => /^\d{0,3}\.?\d{0,2}$/.test(e.target.value) && setPercentA(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Recipient B % (automatic)</span>
              <input className={`${inputClass} tabular-nums`} style={{ ...inputStyle, opacity: 0.7 }} readOnly value={bpsB === null ? '' : (bpsB / 100).toFixed(2).replace(/\.?0+$/, '')} />
            </label>
          </div>
          {show('split') && <span className="mt-1.5 block text-xs" style={{ color: 'var(--danger)' }}>{show('split')}</span>}
        </div>

        <PayoutPreview payoutA={payouts?.payoutA ?? null} payoutB={payouts?.payoutB ?? null} bpsA={bpsA} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valid for">
            <select className={inputClass} style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
              {DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Reference" hint="Optional, stored as a hash">
            <input className={inputClass} style={inputStyle} placeholder="e.g. INV-2026-014" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        {isConnected ? (
          <Button className="w-full" loading={tx.busy} disabled={!deployed} onClick={() => void submit()}>
            {!deployed ? 'Contract not deployed' : tx.state.phase === 'wallet' ? 'Confirm in wallet...' : tx.state.phase === 'confirming' ? 'Creating invoice...' : 'Create invoice onchain'}
          </Button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show: open }) => <Button className="w-full" onClick={open}>Connect wallet to continue</Button>}
          </ConnectKitButton.Custom>
        )}

        <TxNotice label="Create invoice" state={tx.state} onDismiss={tx.reset} />
        {createdId !== null && tx.state.phase === 'success' && (
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            Invoice #{createdId.toString()} created. It is open on the right.
          </p>
        )}
      </div>
    </Card>
  )
}
