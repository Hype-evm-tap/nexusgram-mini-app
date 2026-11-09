# Mainnet deployment scripts

These scripts are intentionally **signing-only**: they do not contain a seed phrase or private key.

Before running a deployment:
1. Install Node.js 22+.
2. Install dependencies with `npm install`.
3. Configure your wallet signer locally, never in GitHub.
4. Run against TON mainnet only after checking the exact transaction value and recipient.
5. Confirm the transaction in your wallet.

The repository currently contains metadata and deployment configuration, but the exact signing implementation should be completed against the chosen current TON reference contract version rather than copying an outdated contract binary.

Official TON docs:
https://docs.ton.org/contracts/standard/tokens/nft/nft-reference
https://docs.ton.org/contracts/blueprint/overview
