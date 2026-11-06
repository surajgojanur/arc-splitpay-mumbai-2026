import { isAddress, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'

export { arcSplitAbi } from './arcSplitAbi'

/** The only chain ArcSplit runs on in this app. */
export const ARC_CHAIN_ID = arcTestnet.id
export const ARC_CHAIN = requireChain(ARC_CHAIN_ID)

const usdcFact = getUsdc(ARC_CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
/** Official Arc Testnet USDC ERC-20 interface (6 decimals), from the Arc registry. */
export const USDC_ADDRESS: Address = usdcFact.address as Address

const rawAddress = import.meta.env.VITE_ARCSPLIT_ADDRESS as string | undefined
/** Deployed ArcSplit address. Undefined until a deployment is configured in `.env`. */
export const ARCSPLIT_ADDRESS: Address | undefined =
  rawAddress && isAddress(rawAddress) ? rawAddress : undefined

const rawBlock = import.meta.env.VITE_ARCSPLIT_DEPLOY_BLOCK as string | undefined
/** Block the contract was deployed at; bounds the event lookup for receipts. */
export const ARCSPLIT_DEPLOY_BLOCK: bigint | undefined =
  rawBlock && /^\d+$/.test(rawBlock) ? BigInt(rawBlock) : undefined

export const BPS_DENOMINATOR = 10_000

/** Mirrors the on-chain `Status` enum. */
export const InvoiceStatus = { None: 0, Open: 1, Paid: 2, Cancelled: 3 } as const
