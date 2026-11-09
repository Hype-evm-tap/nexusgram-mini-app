import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NftCollection } from '../wrappers/NftCollection';

const OWNER = Address.parse(
  process.env.NEXUSGRAM_OWNER ??
    'UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c',
);

const COLLECTION_ADDRESS =
  process.env.NEXUSGRAM_COLLECTION ??
  'EQDIDCxDJSrfbak2rJtIcnoe_y_DOjeTGuuvL5eJGoSMZH6L';

export async function run(provider: NetworkProvider) {
  const collection = provider.open(
    new NftCollection(Address.parse(COLLECTION_ADDRESS)),
  );

  console.log('Network: TON mainnet');
  console.log('Minting NexusGram Robot #001 to:', OWNER.toString());
  console.log('Collection:', COLLECTION_ADDRESS);
  console.log(
    'NFT metadata:',
    'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/nft/0.json',
  );
  console.log('Mint index: 0 (only the first NFT)');

  await collection.sendMint(provider.sender(), {
    index: 0,
    ownerAddress: OWNER,
    itemValue: toNano('0.05'),
    contentUrl:
      'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/nft/0.json',
    value: toNano('0.04'), // Lower wallet contribution; collection balance can cover the 0.05 TON item funding.
  });

  console.log(
    'Wallet request submitted. This script does not claim the NFT is minted; verify the item contract transaction and get_nft_data on TONScan.',
  );
}
