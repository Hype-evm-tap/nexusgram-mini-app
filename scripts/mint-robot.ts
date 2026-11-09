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
  console.log('Retrying NexusGram Robot #001 to:', OWNER.toString());
  console.log('Collection:', COLLECTION_ADDRESS);
  console.log(
    'NFT metadata:',
    'https://raw.githubusercontent.com/Hype-evm-tap/nexusgram-mini-app/main/nft/0.json',
  );
  console.log('Mint index: 0 (retry failed, uninitialized item address)');

  await collection.sendMint(provider.sender(), {
    index: 0,
    ownerAddress: OWNER,
    itemValue: toNano('0.08'),
    contentUrl: '0.json',
    value: toNano('0.04'),
  });

  console.log(
    'Mint request submitted. Confirm the item contract is active and get_nft_data reports initialized before treating the NFT as minted.',
  );
}
