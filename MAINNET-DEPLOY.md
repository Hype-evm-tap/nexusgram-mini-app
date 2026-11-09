# NexusGram Robot #001 — Mainnet deployment

## Current state

Prepared for a real TON mainnet deployment. **No mainnet transaction has been signed yet.**

Owner/payment wallet:
`UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c`

- Collection: NexusGram Collection
- Item: Robot #001
- Index: 0
- Planned supply: 10,000
- Initial sale price: 25 TON
- Standard: TEP-62
- Metadata: TEP-64
- Royalty: TEP-66

## 0.2 TON budget

Treat 0.2 TON as a tight deployment budget. Do not deploy a sale contract until its actual required balance is checked. The old official fixed-price sale example documents a 1 TON minimum gas amount, so that example should **not** be deployed with a 0.2 TON wallet balance.

## Safe sequence

1. Deploy the standard TEP-62 collection.
2. Mint item index 0 to the owner wallet.
3. Verify collection and item on a TON explorer.
4. Choose a sale/marketplace route that fits the remaining balance.
5. Connect the app Buy button only after the real sale address is verified.

TON mainnet transactions are real and irreversible. Deployment requires a wallet signature.

Official references:
- https://docs.ton.org/contracts/standard/tokens/nft/nft-reference
- https://github.com/ton-blockchain/nft-contract
