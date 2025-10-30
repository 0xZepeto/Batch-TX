const inquirer = require('inquirer');
const chalk = require('chalk');
const ethers = require('ethers');
const { readLines } = require('../utils/fileReader');
const { getNetworks, selectNetwork } = require('../utils/network');
const { sendNativeToken, sendERC20Token, getBalance } = require('../utils/transaction');

const showHeader = () => {
  console.log(chalk.cyan(`
  ╔══════════════════════════════════════╗
  ║       BATCH TOKEN SENDER v1.0               ║
  ║      Support: ETH, BSC, AVAX, CELO          ║
  ╚══════════════════════════════════════╝
  `));
};

const getTokenType = async () => {
  const { tokenType } = await inquirer.prompt([{
    type: 'list',
    name: 'tokenType',
    message: chalk.cyan('💰 Pilih Jenis Token:'),
    choices: [
      { name: 'Native Token (ETH/BNB/AVAX/CELO)', value: 'native' },
      { name: 'ERC20/BEP20 Token', value: 'erc20' }
    ]
  }]);
  return tokenType;
};

const getSendMode = async () => {
  const { sendMode } = await inquirer.prompt([{
    type: 'list',
    name: 'sendMode',
    message: chalk.cyan('📤 Mode Pengiriman:'),
    choices: [
      { name: '1 Address → Banyak Address', value: 'oneToMany' },
      { name: 'Banyak Address → 1 Address', value: 'manyToOne' },
      { name: 'Split Saldo (All → Many)', value: 'splitBalance' }
    ]
  }]);
  return sendMode;
};

const getAmount = async (network, tokenType) => {
  const { amount } = await inquirer.prompt([{
    type: 'input',
    name: 'amount',
    message: chalk.cyan(`💸 Jumlah ${tokenType === 'native' ? network.symbol : 'Token'}:`),
    validate: (input) => !isNaN(input) || 'Masukkan angka yang valid!'
  }]);
  return parseFloat(amount);
};

const getTokenAddress = async () => {
  const { tokenAddress } = await inquirer.prompt([{
    type: 'input',
    name: 'tokenAddress',
    message: chalk.cyan('📜 Alamat Smart Contract Token:'),
    validate: (input) => ethers.isAddress(input) || 'Alamat tidak valid!'
  }]);
  return tokenAddress;
};

const getRecipientAddress = async () => {
  const { recipient } = await inquirer.prompt([{
    type: 'input',
    name: 'recipient',
    message: chalk.cyan('📮 Alamat Tujuan:'),
    validate: (input) => ethers.isAddress(input) || 'Alamat tidak valid!'
  }]);
  return recipient;
};

const getSplitOptions = async () => {
  const { splitType } = await inquirer.prompt([{
    type: 'list',
    name: 'splitType',
    message: chalk.cyan('🧮 Metode Pembagian:'),
    choices: [
      { name: 'Rata-rata (Equal Split)', value: 'equal' },
      { name: 'Custom (Manual)', value: 'custom' }
    ]
  }]);
  
  if (splitType === 'custom') {
    const { customAmount } = await inquirer.prompt([{
      type: 'input',
      name: 'customAmount',
      message: chalk.cyan('💸 Jumlah per address:'),
      validate: (input) => !isNaN(input) || 'Masukkan angka yang valid!'
    }]);
    return parseFloat(customAmount);
  }
  
  return 'equal';
};

const getConcurrency = async () => {
  const { concurrency } = await inquirer.prompt([{
    type: 'number',
    name: 'concurrency',
    message: chalk.cyan('⚡ Jumlah Transaksi Paralel:'),
    default: 3,
    validate: (input) => input > 0 || 'Minimal 1!'
  }]);
  return concurrency;
};

const getRetryOption = async () => {
  const { retry } = await inquirer.prompt([{
    type: 'confirm',
    name: 'retry',
    message: chalk.cyan('🔄 Coba ulang jika gagal?'),
    default: true
  }]);
  return retry;
};

const processTransactions = async (transactions, concurrency, retry) => {
  const results = [];
  const batchSize = concurrency;
  
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const batchPromises = batch.map(async (tx) => {
      let attempt = 0;
      const maxAttempts = retry ? 3 : 1;
      
      while (attempt < maxAttempts) {
        attempt++;
        try {
          const result = await tx();
          results.push(result);
          break;
        } catch (error) {
          if (attempt === maxAttempts) {
            results.push({ success: false, error: error.message });
          }
        }
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  return results;
};

const main = async () => {
  showHeader();
  
  // Pilih jaringan
  const networks = getNetworks();
  const selectedNetwork = await selectNetwork(networks);
  const provider = new ethers.JsonRpcProvider(selectedNetwork.rpc);
  
  // Pilih jenis token
  const tokenType = await getTokenType();
  
  // Pilih mode pengiriman
  const sendMode = await getSendMode();
  
  // Ambil private keys
  const privateKeys = readLines('privatekey.txt');
  const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
  
  // Ambil addresses
  const addresses = readLines('address.txt');
  
  // Setup transaksi
  let transactions = [];
  let tokenAddress, amount, recipient, splitOption;
  
  if (tokenType === 'erc20') {
    tokenAddress = await getTokenAddress();
  }
  
  if (sendMode === 'splitBalance') {
    splitOption = await getSplitOptions();
    
    for (const wallet of wallets) {
      const balance = await getBalance(provider, wallet.address, selectedNetwork);
      const amountToSend = splitOption === 'equal' 
        ? parseFloat(balance) / addresses.length 
        : splitOption;
      
      for (const address of addresses) {
        transactions.push(() => 
          sendNativeToken(provider, wallet, address, amountToSend, selectedNetwork)
        );
      }
    }
  } else {
    amount = await getAmount(selectedNetwork, tokenType);
    
    if (sendMode === 'oneToMany') {
      for (const wallet of wallets) {
        for (const address of addresses) {
          transactions.push(() => 
            tokenType === 'native' 
              ? sendNativeToken(provider, wallet, address, amount, selectedNetwork)
              : sendERC20Token(provider, wallet, tokenAddress, address, amount, selectedNetwork)
          );
        }
      }
    } else {
      recipient = await getRecipientAddress();
      for (const wallet of wallets) {
        transactions.push(() => 
          tokenType === 'native' 
            ? sendNativeToken(provider, wallet, recipient, amount, selectedNetwork)
            : sendERC20Token(provider, wallet, tokenAddress, recipient, amount, selectedNetwork)
        );
      }
    }
  }
  
  // Opsi concurrency dan retry
  const concurrency = await getConcurrency();
  const retry = await getRetryOption();
  
  // Proses transaksi
  console.log(chalk.yellow(`\n⚙️ Memproses ${transactions.length} transaksi...`));
  const results = await processTransactions(transactions, concurrency, retry);
  
  // Tampilkan hasil
  console.log(chalk.cyan('\n📊 Hasil Transaksi:'));
  const success = results.filter(r => r.success).length;
  const failed = results.length - success;
  
  console.log(chalk.green(`✅ Berhasil: ${success}`));
  console.log(chalk.red(`❌ Gagal: ${failed}`));
  
  if (failed > 0) {
    console.log(chalk.yellow('\n⚠️ Transaksi Gagal:'));
    results.filter(r => !r.success).forEach((r, i) => {
      console.log(chalk.red(`${i + 1}. ${r.error}`));
    });
  }
};

module.exports = main;
