import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, getAbiItem, type Hex } from 'viem'
import { usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import {
  ARC_CHAIN_ID,
  ARCSPLIT_ADDRESS,
  ARCSPLIT_DEPLOY_BLOCK,
  USDC_ADDRESS,
  arcSplitAbi,
} from '@/contracts/arcSplit'

const POLL_MS = 6000
const FALLBACK_LOOKBACK = 20_000n

export interface InvoiceEvents {
  createdTx?: Hex
  paidTx?: Hex
  cancelledTx?: Hex
  /** True when the lookup window did not start at the deployment block. */
  partialWindow: boolean
}

/** Reads one invoice, the payer's allowance and balance, and its lifecycle transactions. */
export function useInvoice(id: bigint | undefined) {
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const enabled = ARCSPLIT_ADDRESS !== undefined && id !== undefined

  const invoice = useReadContract({
    address: ARCSPLIT_ADDRESS,
    abi: arcSplitAbi,
    functionName: 'getInvoice',
    args: [id ?? 0n],
    chainId: ARC_CHAIN_ID,
    query: { enabled, refetchInterval: POLL_MS, retry: false },
  })

  const expired = useReadContract({
    address: ARCSPLIT_ADDRESS,
    abi: arcSplitAbi,
    functionName: 'isExpired',
    args: [id ?? 0n],
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && invoice.isSuccess, refetchInterval: POLL_MS },
  })

  const payouts = useReadContract({
    address: ARCSPLIT_ADDRESS,
    abi: arcSplitAbi,
    functionName: 'payoutsOf',
    args: [id ?? 0n],
    chainId: ARC_CHAIN_ID,
    query: { enabled: enabled && invoice.isSuccess },
  })

  const payer = invoice.data?.payer
  const funding = useReadContracts({
    allowFailure: false,
    contracts:
      payer && ARCSPLIT_ADDRESS
        ? ([
            { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [payer, ARCSPLIT_ADDRESS], chainId: ARC_CHAIN_ID },
            { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [payer], chainId: ARC_CHAIN_ID },
          ] as const)
        : [],
    query: { enabled: payer !== undefined && ARCSPLIT_ADDRESS !== undefined, refetchInterval: POLL_MS },
  })

  const events = useQuery<InvoiceEvents>({
    queryKey: ['arcsplit-events', ARCSPLIT_ADDRESS, id?.toString(), invoice.data?.status],
    enabled: enabled && invoice.isSuccess && publicClient !== undefined,
    queryFn: async () => {
      if (!publicClient || !ARCSPLIT_ADDRESS || id === undefined) return { partialWindow: true }
      const head = await publicClient.getBlockNumber()
      const fromBlock = ARCSPLIT_DEPLOY_BLOCK ?? (head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n)
      const common = { address: ARCSPLIT_ADDRESS, args: { id }, fromBlock, toBlock: head } as const
      const [created, paid, cancelled] = await Promise.all([
        publicClient.getLogs({ ...common, event: getAbiItem({ abi: arcSplitAbi, name: 'InvoiceCreated' }) }),
        publicClient.getLogs({ ...common, event: getAbiItem({ abi: arcSplitAbi, name: 'InvoicePaid' }) }),
        publicClient.getLogs({ ...common, event: getAbiItem({ abi: arcSplitAbi, name: 'InvoiceCancelled' }) }),
      ])
      return {
        createdTx: created[0]?.transactionHash,
        paidTx: paid[0]?.transactionHash,
        cancelledTx: cancelled[0]?.transactionHash,
        partialWindow: ARCSPLIT_DEPLOY_BLOCK === undefined,
      }
    },
  })

  const { refetch: refetchInvoice } = invoice
  const { refetch: refetchExpired } = expired
  const { refetch: refetchFunding } = funding
  const { refetch: refetchEvents } = events
  const refetchAll = useCallback(async () => {
    await Promise.all([refetchInvoice(), refetchExpired(), refetchFunding(), refetchEvents()])
  }, [refetchInvoice, refetchExpired, refetchFunding, refetchEvents])

  const notFound = invoice.isError && /InvoiceNotFound/.test(invoice.error.message)

  return {
    invoice: invoice.data,
    isLoading: enabled && invoice.isLoading,
    notFound,
    loadError: invoice.isError && !notFound ? invoice.error.message : undefined,
    expired: expired.data ?? false,
    payouts: payouts.data,
    allowance: funding.data?.[0],
    balance: funding.data?.[1],
    events: events.data,
    refetchAll,
  }
}
