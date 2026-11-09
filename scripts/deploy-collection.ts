import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { NftCollection } from '../wrappers/NftCollection.js';

const OWNER = Address.parse(
  'UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c',
);

const COLLECTION_METADATA =
  'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/collection.json';

const COMMON_CONTENT_URL =
  'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/nft/';

export async function run(provider: NetworkProvider) {
  const collection = provider.open(
    NftCollection.createFromConfig(
      {
        ownerAddress: OWNER,
        collectionContentUrl: COLLECTION_METADATA,
        commonContentUrl: COMMON_CONTENT_URL,
        nftItemCode: await compile('NftItem'),
        royaltyFactor: 250,
        royaltyBase: 10000,
        royaltyAddress: OWNER,
      },
      await compile('NftCollection'),
    ),
  );

  console.log('NexusGram Collection address:', collection.address.toString());
  console.log('Owner:', OWNER.toString());
  console.log('Collection metadata:', COLLECTION_METADATA);
  console.log('Deployment budget requested: 0.08 TON');

  if (await provider.isContractDeployed(collection.address)) {
    console.log('Collection is already deployed. No transaction sent.');
    return;
  }

  await collection.sendDeploy(provider.sender(), toNano('0.08'));
  await provider.waitForDeploy(collection.address);

  console.log('NexusGram Collection deployed:', collection.address.toString());
}
