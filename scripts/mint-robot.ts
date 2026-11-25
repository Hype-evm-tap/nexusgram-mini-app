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

  // The collection's common prefix already ends in /nft/.
  // Store only the filename suffix; get_nft_content adds the off-chain tag and prefix.
  const METADATA_URL = '0.json';

  console.log('Network: TON mainnet');
  console.log('Minting NexusGram Robot #001 to:', OWNER.toString());
  console.log('Collection:', COLLECTION_ADDRESS);
  console.log('NFT metadata suffix:', METADATA_URL);
  console.log('Mint index: 0');

  await collection.sendMint(provider.sender(), {
    index: 0,
    ownerAddress: OWNER,
    itemValue: toNano('0.08'),
    contentUrl: METADATA_URL, // relative suffix appended to the collection common prefix
    value: toNano('0.04'),
  });

  console.log(
    'Mint request submitted. After confirmation check get_nft_data / tonviewer — metadata + robot image should now resolve.',
  );
}
