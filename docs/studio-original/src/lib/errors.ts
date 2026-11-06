import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

export interface ParsedTxError {
  /** `rejected` means the user declined in their wallet: not a failure. */
  kind: 'rejected' | 'failed'
  message: string
}

const REVERT_MESSAGES: Record<string, string> = {
  NotPayer: 'Only the designated payer can settle this invoice.',
  NotAuthorized: 'Only the invoice creator or the payer can cancel it.',
  InvoiceNotFound: 'This invoice does not exist.',
  InvoiceExpired: 'This invoice has expired and can no longer be paid.',
  InvoiceNotOpen: 'This invoice is already paid or cancelled.',
  InsufficientAllowance: 'USDC allowance is too low. Approve the invoice amount first.',
  ZeroAddress: 'An address field is empty or zero.',
  ContractAddressNotAllowed: 'The ArcSplit contract cannot be a payer or recipient.',
  IdenticalRecipients: 'The two recipients must be different addresses.',
  ZeroAmount: 'The amount must be greater than zero.',
  InvalidBasisPoints: 'The split must be two positive shares that add up to 100%.',
  InvalidExpiry: 'The expiry must be in the future.',
  ZeroPayout: 'The amount is too small: one recipient would receive 0 USDC.',
}

export function parseTxError(error: unknown): ParsedTxError {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return { kind: 'rejected', message: 'You rejected the request in your wallet.' }
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name && REVERT_MESSAGES[name]) return { kind: 'failed', message: REVERT_MESSAGES[name] }
      if (name) return { kind: 'failed', message: `The contract reverted: ${name}.` }
    }
  }
  const text = error instanceof Error ? error.message : String(error)
  const lower = text.toLowerCase()
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return { kind: 'rejected', message: 'You rejected the request in your wallet.' }
  }
  for (const [name, message] of Object.entries(REVERT_MESSAGES)) {
    if (text.includes(name)) return { kind: 'failed', message }
  }
  if (lower.includes('insufficient funds') || lower.includes('exceeds balance')) {
    return { kind: 'failed', message: 'Insufficient USDC balance for this transaction or its gas.' }
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch')) {
    return { kind: 'failed', message: 'Network issue. Check your connection and try again.' }
  }
  const short = error instanceof BaseError ? error.shortMessage : ''
  return { kind: 'failed', message: short || 'The transaction failed. Please try again.' }
}
