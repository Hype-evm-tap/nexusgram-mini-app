import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Sender,
  SendMode,
  contractAddress,
} from '@ton/core';

export class NftCollection implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromConfig(
    config: {
      ownerAddress: Address;
      collectionContentUrl: string;
      commonContentUrl: string;
      nftItemCode: Cell;
      royaltyFactor: number;
      royaltyBase: number;
      royaltyAddress: Address;
    },
    code: Cell,
    workchain = 0,
  ) {
    const collectionContent = beginCell()
      .storeUint(1, 8)
      .storeStringTail(config.collectionContentUrl)
      .endCell();

    const commonContent = beginCell()
      .storeUint(1, 8)
      .storeStringTail(config.commonContentUrl)
      .endCell();

    const content = beginCell()
      .storeRef(collectionContent)
      .storeRef(commonContent)
      .endCell();

    const royaltyParams = beginCell()
      .storeUint(config.royaltyFactor, 16)
      .storeUint(config.royaltyBase, 16)
      .storeAddress(config.royaltyAddress)
      .endCell();

    const data = beginCell()
      .storeAddress(config.ownerAddress)
      .storeUint(0, 64)
      .storeRef(content)
      .storeRef(config.nftItemCode)
      .storeRef(royaltyParams)
      .endCell();

    const init = { code, data };
    return new NftCollection(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    opts: {
      index: number;
      itemValue: bigint;
      contentUrl: string;
      value: bigint;
    },
  ) {
    const itemContent = beginCell()
      .storeUint(1, 8)
      .storeStringTail(opts.contentUrl)
      .endCell();

    const body = beginCell()
      .storeUint(1, 32)
      .storeUint(0, 64)
      .storeUint(opts.index, 64)
      .storeCoins(opts.itemValue)
      .storeRef(itemContent)
      .endCell();

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async getCollectionData(provider: ContractProvider) {
    return provider.get('get_collection_data', []);
  }
}
