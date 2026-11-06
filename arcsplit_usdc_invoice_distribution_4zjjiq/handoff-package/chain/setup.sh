#!/usr/bin/env bash
# Installs the exact dependency versions ArcSplit was tested with. Run from chain/ inside a git repository.
set -euo pipefail
cd "$(dirname "$0")"
forge install foundry-rs/forge-std@v1.17.0 OpenZeppelin/openzeppelin-contracts@v5.6.1
echo "Pinned: forge-std v1.17.0 (f3dae6e6ee381f25eb6a246f7da9b85c91a68219), openzeppelin-contracts v5.6.1 (5fd1781b1454fd1ef8e722282f86f9293cacf256)"
