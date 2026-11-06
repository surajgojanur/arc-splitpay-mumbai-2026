import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { TokenUSDC } from '@web3icons/react'
import { ARC_CHAIN, ARC_CHAIN_ID, USDC_ADDRESS } from '@/contracts/arcSplit'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { shortAddress } from '@/lib/format'

function Mark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
      <rect width="34" height="34" rx="10" fill="var(--accent)" />
      <path d="M8 17h8m0 0 7-6m-7 6 7 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="11" r="2" fill="#acc6e9" />
      <circle cx="25" cy="23" r="2" fill="#acc6e9" />
    </svg>
  )
}

function WalletBalance({ address }: { address: `0x${string}` }) {
  const { data } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
    chainId: ARC_CHAIN_ID,
    query: { refetchInterval: 8000 },
  })
  if (data === undefined) return null
  return (
    <span className="hidden items-center gap-1.5 text-sm font-semibold tabular-nums sm:inline-flex" style={{ color: 'var(--ink-2)' }}>
      <TokenUSDC variant="branded" size={18} />
      {Amount.fromRaw(data, usdcDecimalsFor(ARC_CHAIN_ID)).toFixed(2)} USDC
    </span>
  )
}

export function Header() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Mark />
        <div>
          <h1 className="display text-xl font-bold leading-none">ArcSplit</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>One USDC invoice, paid to two people at once</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(16,97,166,0.10)', color: 'var(--accent-hover)' }}>
          {ARC_CHAIN.name}
        </span>
        {address && <WalletBalance address={address} />}
        {wrongChain && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
            disabled={isPending}
            className="min-h-11 rounded-2xl border px-3 text-sm font-semibold"
            style={{ borderColor: 'rgba(186,43,76,0.35)', color: 'var(--danger)' }}
          >
            {isPending ? 'Switching...' : 'Switch to Arc Testnet'}
          </button>
        )}
        <ConnectKitButton.Custom>
          {({ isConnected: connected, show, address: shown }) => (
            <button
              type="button"
              onClick={show}
              className="min-h-11 rounded-2xl px-4 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {connected && shown ? <span className="mono">{shortAddress(shown)}</span> : 'Connect wallet'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  )
}
