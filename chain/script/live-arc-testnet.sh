#!/usr/bin/env bash
# ArcSplit live run on Arc Testnet: deploy -> record -> one real 70/30 payment -> duplicate-payment check.
# Requires chain/.env (see .env.example) with a faucet-funded throwaway PRIVATE_KEY. Arc Testnet only.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
RPC="${ARC_TESTNET_RPC_URL:-https://rpc.testnet.arc.io}"
U=0x3600000000000000000000000000000000000000
[ "$(cast chain-id --rpc-url "$RPC")" = "5042002" ] || { echo "Not Arc Testnet"; exit 1; }
ME=$(cast wallet address --private-key "$PRIVATE_KEY")
BAL=$(cast call $U 'balanceOf(address)(uint256)' "$ME" --rpc-url "$RPC" | awk '{print $1}')
echo "deployer $ME USDC(6dp)=$BAL"
[ "$BAL" -ge 2000000 ] || { echo "BLOCKED: fund $ME with >=2 USDC at https://faucet.circle.com (Arc Testnet)"; exit 2; }

if [ -z "${ARCSPLIT_ADDRESS:-}" ]; then
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY"
  node script/write-deployment.mjs
  ARCSPLIT_ADDRESS=$(node -p 'require("./deployments/arc-testnet.json").contractAddress')
fi
export ARCSPLIT_ADDRESS
echo "ArcSplit $ARCSPLIT_ADDRESS"

bal() { cast call $U 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }
A0=$(bal "$RECIPIENT_A"); B0=$(bal "$RECIPIENT_B")
forge script script/DemoPayment.s.sol --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY"
A1=$(bal "$RECIPIENT_A"); B1=$(bal "$RECIPIENT_B")
echo "recipient A delta: $((A1 - A0))  recipient B delta: $((B1 - B0))"

ID=$(cast call "$ARCSPLIT_ADDRESS" 'invoiceCount()(uint256)' --rpc-url "$RPC" | awk '{print $1}')
echo "invoice $ID: $(cast call "$ARCSPLIT_ADDRESS" 'getInvoice(uint256)(address,address,address,uint256,uint16,uint64,uint8)' "$ID" --rpc-url "$RPC" | tr '\n' ' ')"
echo "duplicate payment (eth_call as payer, expect InvoiceNotOpen 0x094311f1):"
cast call "$ARCSPLIT_ADDRESS" 'payInvoice(uint256)' "$ID" --from "$ME" --rpc-url "$RPC" 2>&1 | tail -1 || true

node -e '
const r=require("./broadcast/DemoPayment.s.sol/5042002/run-latest.json");
r.transactions.forEach((t,i)=>{const rc=r.receipts[i];console.log(`${t.function??t.transactionType}  ${t.hash}  gasUsed=${parseInt(rc.gasUsed,16)}  status=${rc.status}  https://explorer.testnet.arc.io/tx/${t.hash}`)})'
