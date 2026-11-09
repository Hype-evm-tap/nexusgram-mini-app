# NexusGram Robot NFT #001

TON mainnet collection configuration for the NexusGram robotic collectible.

## Configured owner wallet

`UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c`

This is a public TON address only. Never put a seed phrase or private key in this repository.

## NFT

- Collection: NexusGram Collection
- First item: NexusGram Robot #001
- Item index: 0
- Planned collection size: 10,000
- Initial sale price: 25 TON
- Rarity: Legendary
- Standard: TEP-62 NFT
- Metadata: TEP-64
- Royalty interface: TEP-66

## Mainnet deployment

The repository contains the artwork and metadata, but **a real mainnet deployment still requires a wallet signature**. No tool in this project stores or receives your seed phrase/private key.

Recommended sequence:

1. Host the collection JSON and item JSON at stable HTTPS/IPFS URLs.
2. Deploy a standard TEP-62 collection contract with the configured owner address.
3. Mint item index 0 to the owner wallet.
4. Put the item into a fixed-price TON sale at 25 TON, or use a compatible TON marketplace.
5. Verify the collection/item addresses on a TON explorer.
6. Connect the mini-app's Buy button to the live sale contract only after the sale address has been verified.

TON's official reference implementation provides the collection/item contracts and also documents fixed-price sale contracts. See the official TON NFT documentation before signing mainnet transactions.

## Metadata

- Collection: `collection.json`
- Item 0: `nft/0.json`
- Artwork: `robot.svg`

For production, prefer immutable HTTPS or IPFS/TON Storage metadata URLs. TON documentation recommends permanent metadata links.

## Important

Do not claim an NFT is minted or sold until the corresponding TON mainnet transaction is confirmed.
