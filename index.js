require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { JsonRpcProvider, Contract } = require("ethers");
const { HDNodeWallet, Mnemonic } = require("ethers/wallet");
const bip39 = require("bip39");
const bip32 = require("bip32");
const bitcoin = require("bitcoinjs-lib");
const TronWeb = require("tronweb");
const hdkey = require("hdkey");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.post("/balance", async (req, res) => {
  const { seedPhrase } = req.body;

  if (!seedPhrase) {
    return res.status(400).json({ error: "Seed phrase is required." });
  }

  try {
    let arrayCoins = [];

    // === ETH / BNB ===
    const mnemonic = Mnemonic.fromPhrase(seedPhrase);
    const hdNode = HDNodeWallet.fromMnemonic(mnemonic);
    const path = "44'/60'/0'/0/0";
    const ethWallet = hdNode.derivePath(path);
    const bscWallet = hdNode.derivePath(path);

    const erc20Abi = ["function balanceOf(address) view returns (uint256)"];

    // === ETH ===
    const ethProvider = new JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`);
    const ethAddress = ethWallet.address;
    const usdtERC = new Contract("0xdAC17F958D2ee523a2206206994597C13D831ec7", erc20Abi, ethProvider);
    const usdcERC = new Contract("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", erc20Abi, ethProvider);
    const ethBal = await ethProvider.getBalance(ethAddress);
    const usdtEth = await usdtERC.balanceOf(ethAddress);
    const usdcEth = await usdcERC.balanceOf(ethAddress);
    arrayCoins.push({name: "ETH", type: "", amount: Number(ethBal) / 1e18});
    arrayCoins.push({name: "USDT", type: "ERC20", amount: Number(usdtEth) / 1e6});
    arrayCoins.push({name: "USDC", type: "ERC20", amount: Number(usdcEth) / 1e6});

    // === BNB ===
    const bscProvider = new JsonRpcProvider(process.env.BSC_RPC);
    const bscAddress = bscWallet.address;
    const usdtBEP = new Contract("0x55d398326f99059fF775485246999027B3197955", erc20Abi, bscProvider);
    const usdcBEP = new Contract("0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", erc20Abi, bscProvider);
    const dogeBEP = new Contract("0xba2ae424d960c26247dd6c32edc70b295c744c43", erc20Abi, bscProvider);
    const bnbBal = await bscProvider.getBalance(bscAddress);
    const usdtBep = await usdtBEP.balanceOf(bscAddress);
    const usdcBep = await usdcBEP.balanceOf(bscAddress);
    const dogeBep = await dogeBEP.balanceOf(bscAddress);
    arrayCoins.push({name: "BNB", type: "", amount: Number(bnbBal) / 1e18});
    arrayCoins.push({name: "USDT", type: "BEP20", amount: Number(usdtBep) / 1e18});
    arrayCoins.push({name: "USDC", type: "BEP20", amount: Number(usdcBep) / 1e18});
    arrayCoins.push({name: "DOGE", type: "BEP20", amount: Number(dogeBep) / 1e6});

    // === TRON ===
    const tronSeed = await bip39.mnemonicToSeed(seedPhrase);
    const root = hdkey.fromMasterSeed(tronSeed);
    const child = root.derive("m/44'/195'/0'/0/0");
    const privKeyHex = child.privateKey.toString("hex");

    const tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      headers: { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY },
      privateKey: privKeyHex,
    });

    const tronAddress = tronWeb.address.fromPrivateKey(privKeyHex);
    const trxBalance = await tronWeb.trx.getBalance(tronAddress);

    const tokenContractAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const tronContract = await tronWeb.contract().at(tokenContractAddress);
    const accountHex = tronWeb.address.toHex(tronAddress);
    const balanceUSDT = await tronContract.balanceOf(accountHex).call() / 1e6;

    arrayCoins.push({name: "USDT", type: "TRC20", amount: balanceUSDT});
    arrayCoins.push({name: "TRX", type: "", amount: Number(trxBalance) / 1e6});

    // === SOLANA ===
    const solanaConn = new Connection(process.env.SOLANA_RPC);
    const solanaSeed = Uint8Array.from(tronSeed).slice(0, 32);
    const solanaKey = Keypair.fromSeed(solanaSeed);
    const solAddress = solanaKey.publicKey.toBase58();
    const solBal = await solanaConn.getBalance(new PublicKey(solAddress));
    arrayCoins.push({name: "SOL", type: "", amount: solBal / 1e9});

    // === BTC ===
    const btcNode = bip32.fromSeed(tronSeed, bitcoin.networks.bitcoin);
    const btcKey = btcNode.derivePath("m/44'/0'/0'/0/0");
    const btcAddress = bitcoin.payments.p2pkh({ pubkey: btcKey.publicKey }).address;
    const btcInfo = await axios.get(`https://blockstream.info/api/address/${btcAddress}`);
    const btcBalance = btcInfo.data.chain_stats.funded_txo_sum - btcInfo.data.chain_stats.spent_txo_sum;
    arrayCoins.push({name: "BTC", type: "", amount: btcBalance / 1e8});

    return res.json({ address: { eth: ethAddress, bsc: bscAddress, tron: tronAddress, solana: solAddress, btc: btcAddress }, balances: arrayCoins });

  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`🟢 Backend listening on port ${PORT}`);
});