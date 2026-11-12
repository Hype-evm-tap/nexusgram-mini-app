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

  // Full absolute metadata URL — fixes empty metadata on explorers
  const METADATA_URL =
    'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/nft/1.json';

  console.log('Network: TON mainnet');
  console.log('Minting NexusGram Robot #002 to:', OWNER.toString());
  console.log('Collection:', COLLECTION_ADDRESS);
  console.log('NFT metadata (absolute):', METADATA_URL);
  console.log('Mint index: 1');

  await collection.sendMint(provider.sender(), {
    index: 1,
    ownerAddress: OWNER,
    itemValue: toNano('0.08'),
    contentUrl: METADATA_URL, // absolute URL instead of relative "0.json"
    value: toNano('0.04'),
  });

  console.log(
    'Mint request submitted. After confirmation check get_nft_data / tonviewer — metadata + robot image should now resolve.',
  );
}
