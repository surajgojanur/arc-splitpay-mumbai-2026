#!/usr/bin/env bash
# Explicitly gated Arc Testnet actions. This script can broadcast only after the caller
# chooses one action and supplies that action's confirmation variable. Never run in tests.
set -euo pipefail
cd "$(dirname "$0")/.."

# macOS ships Bash 3.2, which does not support ${value,,} case conversion.
lower() { printf '%s' "$1" | LC_ALL=C tr '[:upper:]' '[:lower:]'; }

ACTION="${1:-}"
case "$ACTION" in
  deploy)
    [[ "${ARCSPLIT_CONFIRM_DEPLOY:-}" == "YES" ]] || {
      echo "BLOCKED: deployment requires ARCSPLIT_CONFIRM_DEPLOY=YES in the invoking shell." >&2
      exit 64
    }
    ;;
  payment)
    [[ "${ARCSPLIT_CONFIRM_PAYMENT:-}" == "YES" ]] || {
      echo "BLOCKED: payment requires ARCSPLIT_CONFIRM_PAYMENT=YES in the invoking shell." >&2
      exit 64
    }
    ;;
  *)
    echo "Usage: ARCSPLIT_CONFIRM_DEPLOY=YES $0 deploy" >&2
    echo "   or: ARCSPLIT_CONFIRM_PAYMENT=YES $0 payment" >&2
    exit 64
    ;;
esac

[[ -f deployment-profile.json ]] || {
  echo "BLOCKED: contract-owner deployment-profile.json is absent." >&2
  exit 2
}
node --input-type=module -e '
  import fs from "node:fs";
  import { execFileSync } from "node:child_process";
  const d = JSON.parse(fs.readFileSync("deployment-profile.json", "utf8"));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (d.approved !== true || d.profile !== "kishore-v1" || d.sourceCommit !== commit) {
    console.error("BLOCKED: deployment profile must be explicitly approved for this exact kishore-v1 source commit.");
    process.exit(2);
  }
'

[[ -f .env ]] || { echo "BLOCKED: chain/.env is missing." >&2; exit 2; }
# Confirmation flags are checked before loading .env; a stored value cannot auto-authorize a write.
set -a
source .env
set +a

RPC="${ARC_TESTNET_RPC_URL:-https://rpc.testnet.arc.io}"
USDC="0x3600000000000000000000000000000000000000"
[[ "$(cast chain-id --rpc-url "$RPC")" == "5042002" ]] || {
  echo "Not Arc Testnet; refusing to continue." >&2
  exit 2
}

ME="$(cast wallet address --private-key "$PRIVATE_KEY")"
NATIVE_BAL="$(cast balance "$ME" --rpc-url "$RPC" | awk '{print $1}')"
echo "Deployer $ME; native gas-token balance (USDC, 18 decimals): $NATIVE_BAL"
node script/amounts.mjs enough "$NATIVE_BAL" 1 || {
  echo "BLOCKED: deployer needs native USDC for Arc Testnet gas; this is separate from ERC-20 USDC." >&2
  exit 2
}

if [[ "$ACTION" == "deploy" ]]; then
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY"
  node script/write-deployment.mjs
  CODE="$(cast code "$(node -p 'require("./deployments/arc-testnet.json").contractAddress')" --rpc-url "$RPC")"
  echo "Runtime code hash for independent source/build review: $(cast keccak "$CODE")"
  echo "Deployment complete. Stop here; payment is a separate explicitly confirmed action."
  exit 0
fi

[[ -n "${ARCSPLIT_ADDRESS:-}" ]] || {
  echo "BLOCKED: set ARCSPLIT_ADDRESS from the reviewed deployment artifact." >&2
  exit 2
}
[[ -f deployments/arc-testnet.json ]] || {
  echo "BLOCKED: receipt-backed deployments/arc-testnet.json is required." >&2
  exit 2
}
node --input-type=module -e '
  import fs from "node:fs";
  const d = JSON.parse(fs.readFileSync("deployments/arc-testnet.json", "utf8"));
  if (d.chainId !== 5042002 || d.contractAddress?.toLowerCase() !== process.env.ARCSPLIT_ADDRESS?.toLowerCase() || d.usdcAddress?.toLowerCase() !== "0x3600000000000000000000000000000000000000" || d.usdcDecimals !== 6) process.exit(2);
'
[[ "${ARCSPLIT_RUNTIME_CODE_HASH:-}" =~ ^0x[0-9a-fA-F]{64}$ ]] || {
  echo "BLOCKED: set the independently reviewed ARCSPLIT_RUNTIME_CODE_HASH." >&2
  exit 2
}
CODE="$(cast code "$ARCSPLIT_ADDRESS" --rpc-url "$RPC")"
[[ "$CODE" != "0x" && "$(cast keccak "$CODE")" == "$(lower "$ARCSPLIT_RUNTIME_CODE_HASH")" ]] || {
  echo "BLOCKED: deployed runtime code hash does not match the reviewed value." >&2
  exit 2
}
[[ "$(cast call "$ARCSPLIT_ADDRESS" 'usdc()(address)' --rpc-url "$RPC" | tr '[:upper:]' '[:lower:]')" == "$(lower "$USDC")" ]] || {
  echo "BLOCKED: selected contract reports a different USDC token." >&2
  exit 2
}
[[ "$(cast call "$USDC" 'decimals()(uint8)' --rpc-url "$RPC")" == "6" ]] || {
  echo "BLOCKED: official USDC ERC-20 decimals check failed." >&2
  exit 2
}
PAYMENT_AMOUNT="${DEMO_AMOUNT:-1000000}"
[[ "$PAYMENT_AMOUNT" =~ ^[1-9][0-9]*$ ]] || {
  echo "BLOCKED: DEMO_AMOUNT must be a positive integer in ERC-20 USDC atomic units (6 decimals)." >&2
  exit 2
}
TOKEN_BAL="$(cast call "$USDC" 'balanceOf(address)(uint256)' "$ME" --rpc-url "$RPC" | awk '{print $1}')"
echo "Payer ERC-20 USDC balance (6 decimals): $TOKEN_BAL; demo amount: $PAYMENT_AMOUNT"
node script/amounts.mjs enough "$TOKEN_BAL" "$PAYMENT_AMOUNT" || {
  echo "BLOCKED: payer needs enough official ERC-20 USDC for DEMO_AMOUNT." >&2
  exit 2
}
for recipient in "${RECIPIENT_A:-}" "${RECIPIENT_B:-}"; do
  [[ "$recipient" =~ ^0x[0-9a-fA-F]{40}$ && "$recipient" != "0x0000000000000000000000000000000000000000" ]] || {
    echo "BLOCKED: configure two valid recipient addresses in .env." >&2
    exit 2
  }
done
[[ "$(lower "$RECIPIENT_A")" != "$(lower "$RECIPIENT_B")" ]] || {
  echo "BLOCKED: recipient addresses must differ." >&2
  exit 2
}
[[ "$(lower "$RECIPIENT_A")" != "$(lower "$ARCSPLIT_ADDRESS")" && "$(lower "$RECIPIENT_B")" != "$(lower "$ARCSPLIT_ADDRESS")" ]] || {
  echo "BLOCKED: the contract cannot receive its own split payout." >&2
  exit 2
}

bal() { cast call "$USDC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }
A0="$(bal "$RECIPIENT_A")"
B0="$(bal "$RECIPIENT_B")"
forge script script/DemoPayment.s.sol --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY"
A1="$(bal "$RECIPIENT_A")"
B1="$(bal "$RECIPIENT_B")"
DELTA_A="$(node script/amounts.mjs delta "$A0" "$A1")"
DELTA_B="$(node script/amounts.mjs delta "$B0" "$B1")"
echo "recipient A delta: $DELTA_A; recipient B delta: $DELTA_B"

ID="$(cast call "$ARCSPLIT_ADDRESS" 'invoiceCount()(uint256)' --rpc-url "$RPC" | awk '{print $1}')"
echo "invoice $ID: $(cast call "$ARCSPLIT_ADDRESS" 'getInvoice(uint256)(address,address,address,uint256,uint16,uint64,uint8)' "$ID" --rpc-url "$RPC" | tr '\n' ' ')"
echo "duplicate settlement eth_call (expect InvoiceNotOpen 0x094311f1):"
cast call "$ARCSPLIT_ADDRESS" 'payInvoice(uint256)' "$ID" --from "$ME" --rpc-url "$RPC" 2>&1 | tail -1 || true

node -e '
const r=require("./broadcast/DemoPayment.s.sol/5042002/run-latest.json");
r.transactions.forEach((t,i)=>{const rc=r.receipts[i];console.log(`${t.function??t.transactionType} ${t.hash} gasUsed=${parseInt(rc.gasUsed,16)} status=${rc.status} https://explorer.testnet.arc.io/tx/${t.hash}`)})'
