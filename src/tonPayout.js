/**
 * NXG jetton auto-payout from treasury wallet (Tonkeeper seed).
 *
 * Cloudflare Worker secrets:
 *   TREASURY_MNEMONIC  - 24-word seed of the wallet that holds NXG (NEVER commit)
 *   NXG_JETTON_MASTER  - jetton master address (EQ...)
 *   NXG_DECIMALS       - decimals (default 9)
 *   TON_API_KEY        - toncenter / tonapi key (recommended)
 *   TON_ENDPOINT       - RPC URL (default toncenter mainnet jsonRPC)
 *   NXG_TRANSFER_GAS   - TON for gas (default 0.06)
 */

function envStr(env, key, fallback = '') {
  return String(env?.[key] ?? fallback).trim();
}

export function payoutConfigured(env) {
  const mnemonic = envStr(env, 'TREASURY_MNEMONIC');
  const master = envStr(env, 'NXG_JETTON_MASTER', 'EQDkKFt5FCNAocxdDmxKBKv0gca5P8FyicTzdcGJwyzvNVcO');
  const words = mnemonic.split(/\s+/).filter(Boolean);
  return words.length >= 12 && /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(master);
}

function toJettonUnits(humanAmount, decimals) {
  const amount = Number(humanAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  const scale = 10n ** BigInt(decimals);
  const [whole, frac = ''] = String(amount).split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * scale + BigInt(fracPadded || '0');
}

/**
 * @param {object} env
 * @param {string} toAddress EQ/UQ...
 * @param {number|string} nxgAmount human amount
 * @returns {Promise<{ok:boolean, txHash?:string, error?:string, seqno?:number}>}
 */
export async function sendNxgJetton(env, toAddress, nxgAmount) {
  if (!payoutConfigured(env)) {
    return { ok: false, error: 'Treasury not configured (set TREASURY_MNEMONIC + NXG_JETTON_MASTER secrets)' };
  }
  const destStr = String(toAddress || '').trim();
  if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(destStr)) {
    return { ok: false, error: 'Invalid destination TON address' };
  }

  const decimals = Math.max(0, Math.min(18, Number(envStr(env, 'NXG_DECIMALS', '9')) || 9));
  const jettonAmount = toJettonUnits(nxgAmount, decimals);
  if (jettonAmount <= 0n) return { ok: false, error: 'Jetton amount is zero' };

  try {
    const [{ mnemonicToPrivateKey }, ton, core] = await Promise.all([
      import('@ton/crypto'),
      import('@ton/ton'),
      import('@ton/core'),
    ]);

    const { TonClient, WalletContractV4, JettonMaster, JettonWallet, internal } = ton;
    const { Address, beginCell, toNano } = core;
    const SendMode = ton.SendMode || { PAY_GAS_SEPARATELY: 1, IGNORE_ERRORS: 2 };

    const words = envStr(env, 'TREASURY_MNEMONIC').split(/\s+/).filter(Boolean);
    const keyPair = await mnemonicToPrivateKey(words);
    const jettonMasterAddr = Address.parse(envStr(env, 'NXG_JETTON_MASTER', 'EQDkKFt5FCNAocxdDmxKBKv0gca5P8FyicTzdcGJwyzvNVcO'));
    const destination = Address.parse(destStr);

    const endpoint =
      envStr(env, 'TON_ENDPOINT') ||
      envStr(env, 'TONCENTER_ENDPOINT') ||
      'https://toncenter.com/api/v2/jsonRPC';
    const apiKey = envStr(env, 'TON_API_KEY') || envStr(env, 'TONCENTER_API_KEY') || undefined;

    const client = new TonClient({ endpoint, apiKey });
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    const contract = client.open(wallet);
    const senderAddress = wallet.address;
    const expectedTreasury = envStr(env, 'TREASURY_WALLET_ADDRESS', 'UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c');
    if (expectedTreasury) {
      try {
        const exp = Address.parse(expectedTreasury);
        if (exp.toString() !== senderAddress.toString() && exp.toRawString() !== senderAddress.toRawString()) {
          // compare friendly forms
          const a = senderAddress.toString({ urlSafe: true, bounceable: false });
          const b = exp.toString({ urlSafe: true, bounceable: false });
          const a2 = senderAddress.toString({ urlSafe: true, bounceable: true });
          if (a !== b && a2 !== exp.toString({ urlSafe: true, bounceable: true }) && senderAddress.toString() !== exp.toString()) {
            console.warn('Treasury mnemonic wallet does not match TREASURY_WALLET_ADDRESS', senderAddress.toString(), expectedTreasury);
          }
        }
      } catch (e) {}
    }

    // Resolve jetton wallet of treasury for this master
    let jettonWalletAddress;
    if (JettonMaster) {
      const master = client.open(JettonMaster.create(jettonMasterAddr));
      jettonWalletAddress = await master.getWalletAddress(senderAddress);
    } else {
      const res = await client.runMethod(jettonMasterAddr, 'get_wallet_address', [
        { type: 'slice', cell: beginCell().storeAddress(senderAddress).endCell() },
      ]);
      jettonWalletAddress = res.stack.readAddress();
    }

    const forwardPayload = beginCell()
      .storeUint(0, 32)
      .storeStringTail('NexusGram NXG withdrawal')
      .endCell();

    const jettonTransferBody = beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(0, 64)
      .storeCoins(jettonAmount)
      .storeAddress(destination)
      .storeAddress(senderAddress)
      .storeBit(0)
      .storeCoins(1n)
      .storeBit(1)
      .storeRef(forwardPayload)
      .endCell();

    const seqno = await contract.getSeqno();
    const gas = toNano(envStr(env, 'NXG_TRANSFER_GAS', '0.06') || '0.06');

    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      sendMode: (SendMode.PAY_GAS_SEPARATELY ?? 1) + (SendMode.IGNORE_ERRORS ?? 2),
      messages: [
        internal({
          to: jettonWalletAddress,
          value: gas,
          bounce: true,
          body: jettonTransferBody,
        }),
      ],
    });

    const txHash = `seqno:${seqno}:from:${senderAddress.toString()}:to:${destination.toString()}:amt:${jettonAmount.toString()}`;
    return {
      ok: true,
      txHash,
      seqno,
      from: senderAddress.toString(),
      jettonWallet: jettonWalletAddress.toString(),
    };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error('NXG payout failed', msg);
    return { ok: false, error: msg.slice(0, 400) };
  }
}
