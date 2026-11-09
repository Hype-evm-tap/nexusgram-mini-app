import { Address, Cell, Contract, ContractProvider } from '@ton/core';

export class NftItem implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  async getData(provider: ContractProvider) {
    return provider.get('get_nft_data', []);
  }
}
