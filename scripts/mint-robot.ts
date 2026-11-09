import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NftCollection } from '../wrappers/NftCollection';

const OWNER = Address.parse(
  'UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c',
);

const COLLECTION_ADDRESS = process.env.NEXUSGRAM_COLLECTION;

if (!COLLECTION_ADDRESS) {
  throw new Error(
    'Set NEXUSGRAM_COLLECTION to the deployed collection address before minting.',
  );
}

export async function run(provider: NetworkProvider) {
  const collection = provider.open(
    new NftCollection(Address.parse(COLLECTION_ADDRESS)),
  );

  console.log('Minting NexusGram Robot #001 to:', OWNER.toString());
  console.log('Collection:', COLLECTION_ADDRESS);
  console.log('NFT metadata:', 'nft/0.json');

  await collection.sendMint(provider.sender(), {
    index: 0,
    itemValue: toNano('0.05'),
    contentUrl:
      'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/nft/0.json',
    value: toNano('0.08'),
  });

  await provider.waitForLastTransaction();
  console.log('Mint transaction submitted. Check the collection for item #001.');
}
