import { useCallback, useState } from 'react'
import type { Hex, TransactionReceipt } from 'viem'
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { ARC_CHAIN_ID } from '@/contracts/arcSplit'
import { parseTxError } from '@/lib/errors'

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'rejected' | 'failed'

export interface TxState {
  phase: TxPhase
  hash?: Hex
  receipt?: TransactionReceipt
  error?: string
}

const IDLE: TxState = { phase: 'idle' }

/**
 * Runs one wallet transaction and tracks its real lifecycle: wallet prompt, onchain confirmation,
 * then success, rejection or failure. The caller supplies the write; this hook never fabricates
 * progress.
 */
export function useTx() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [state, setState] = useState<TxState>(IDLE)

  const reset = useCallback(() => setState(IDLE), [])

  const run = useCallback(
    async (send: () => Promise<Hex>): Promise<TransactionReceipt | null> => {
      let hash: Hex | undefined
      try {
        setState({ phase: 'wallet' })
        if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
        hash = await send()
        setState({ phase: 'confirming', hash })
        if (!publicClient) throw new Error('No RPC client for Arc Testnet')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status === 'reverted') {
          setState({
            phase: 'failed',
            hash,
            receipt,
            error: 'The transaction was mined but reverted onchain. No funds moved.',
          })
          return null
        }
        setState({ phase: 'success', hash, receipt })
        return receipt
      } catch (error) {
        const parsed = parseTxError(error)
        setState({ phase: parsed.kind, hash, error: parsed.message })
        return null
      }
    },
    [chainId, publicClient, switchChainAsync],
  )

  return { state, run, reset, busy: state.phase === 'wallet' || state.phase === 'confirming' }
}
