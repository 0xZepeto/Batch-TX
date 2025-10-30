import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, delay, retry } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load RPC data
const rpcData = JSON.parse(fs.readFileSync(path.join(__dirname, 'rpc.json'), 'utf8'));

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// Emojis for Termux
const EMOJIS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  rocket: '🚀',
  money: '💰',
  network: '🌐',
  token: '🪙',
  send: '📤',
  settings: '⚙️'
};

// Main menu
async function mainMenu() {
  console.log(chalk.cyan.bold(`\n${EMOJIS.rocket} Batch Token Sender ${EMOJIS.rocket}\n`));

  // Select network
  const { networkIndex } = await inquirer.prompt([
    {
      type: 'list',
      name: 'networkIndex',
      message: `${EMOJIS.network} Pilih jaringan:`,
      choices: rpcData.map((rpc, index) => ({
        name: `${rpc.name} (${rpc.symbol})`,
        value: index
      }))
    }
  ]);

  const selectedNetwork = rpcData[networkIndex];
  console.log(chalk.green(`${EMOJIS.success} Jaringan dipilih: ${selectedNetwork.name}`));

  // Select token type
  const { tokenType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tokenType',
      message: `${EMOJIS.token} Pilih jenis token:`,
      choices: [
        { name: 'Native Token', value: 'native' },
        { name: 'ERC20/BEP20 Token', value: 'erc20' }
      ]
    }
  ]);

  // Select send mode
  const { sendMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'sendMode',
      message: `${EMOJIS.send} Pilih mode pengiriman:`,
      choices: [
        { name: '1 Address → Banyak Address', value: 'oneToMany' },
        { name: 'Banyak Address → 1 Address', value: 'manyToOne' }
      ]
    }
  ]);

  // Get amount
  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: `${EMOJIS.money} Masukkan jumlah yang akan dikirim:`,
      validate: input => !isNaN(input) && parseFloat(input) > 0 || 'Jumlah tidak valid!'
    }
  ]);

  // Get token contract if ERC20
  let tokenContract = null;
  if (tokenType === 'erc20') {
    const { contractAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'contractAddress',
        message: `${EMOJIS.token} Masukkan alamat smart contract token:`,
        validate: input => ethers.isAddress(input) || 'Alamat kontrak tidak valid!'
      }
    ]);
    tokenContract = contractAddress;
  }

  // Get addresses
  let addresses = [];
  if (sendMode === 'oneToMany') {
    addresses = readFile('address.txt');
    if (addresses.length === 0) {
      console.log(chalk.red(`${EMOJIS.error} Tidak ada address di address.txt`));
      return;
    }
  } else {
    const { targetAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'targetAddress',
        message: `${EMOJIS.send} Masukkan alamat tujuan:`,
        validate: input => ethers.isAddress(input) || 'Alamat tidak valid!'
      }
    ]);
    addresses = [targetAddress];
  }

  // Get private keys
  const privateKeys = readFile('privatekey.txt');
  if (privateKeys.length === 0) {
    console.log(chalk.red(`${EMOJIS.error} Tidak ada private key di privatekey.txt`));
    return;
  }

  // Concurrency settings
  const { concurrency } = await inquirer.prompt([
    {
      type: 'input',
      name: 'concurrency',
      message: `${EMOJIS.settings} Masukkan concurrency (1-20):`,
      default: 5,
      validate: input => {
        const num = parseInt(input);
        return num > 0 && num <= 20 || 'Concurrency harus antara 1-20!';
      }
    }
  ]);

  // Retry settings
  const { retryCount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'retryCount',
      message: `${EMOJIS.settings} Masukkan jumlah retry (0-5):`,
      default: 3,
      validate: input => {
        const num = parseInt(input);
        return num >= 0 && num <= 5 || 'Retry harus antara 0-5!';
      }
    }
  ]);

  // Confirmation
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `${EMOJIS.warning} Apakah Anda yakin ingin melanjutkan?`,
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow(`${EMOJIS.warning} Transaksi dibatalkan`));
    return;
  }

  // Execute transaction
  const spinner = ora({
    text: chalk.blue('Memproses transaksi...'),
    spinner: 'dots'
  }).start();

  try {
    const results = await executeTransactions(
      selectedNetwork,
      tokenType,
      tokenContract,
      privateKeys,
      addresses,
      amount,
      sendMode,
      parseInt(concurrency),
      parseInt(retryCount)
    );

    spinner.stop();

    // Display results
    console.log(chalk.green.bold(`\n${EMOJIS.success} Hasil Transaksi:\n`));
    results.forEach((result, index) => {
      if (result.success) {
        console.log(
          chalk.green(`${EMOJIS.success} Tx ${index + 1}: ${result.hash}`)
        );
      } else {
        console.log(
          chalk.red(`${EMOJIS.error} Tx ${index + 1}: ${result.error}`)
        );
      }
    });

    const successCount = results.filter(r => r.success).length;
    console.log(chalk.cyan.bold(`\nBerhasil: ${successCount}/${results.length}`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`${EMOJIS.error} Error: ${error.message}`));
  }
}

// Execute transactions
async function executeTransactions(
  network,
  tokenType,
  tokenContract,
  privateKeys,
  addresses,
  amount,
  sendMode,
  concurrency,
  retryCount
) {
  const provider = new ethers.JsonRpcProvider(network.rpc);
  const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));

  const tasks = [];
  const results = [];

  // Prepare tasks
  if (sendMode === 'oneToMany') {
    // 1 sender to multiple receivers
    const wallet = wallets[0];
    const amountPerAddress = ethers.parseUnits(
      (parseFloat(amount) / addresses.length).toFixed(18),
      18
    );

    for (const address of addresses) {
      tasks.push(async () => {
        try {
          if (tokenType === 'native') {
            const tx = await retry(
              () => wallet.sendTransaction({
                to: address,
                value: amountPerAddress
              }),
              retryCount
            );
            await tx.wait();
            return { success: true, hash: tx.hash };
          } else {
            const contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);
            const tx = await retry(
              () => contract.transfer(address, amountPerAddress),
              retryCount
            );
            await tx.wait();
            return { success: true, hash: tx.hash };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
    }
  } else {
    // Multiple senders to 1 receiver
    const targetAddress = addresses[0];
    const amountPerSender = ethers.parseUnits(amount, 18);

    for (const wallet of wallets) {
      tasks.push(async () => {
        try {
          if (tokenType === 'native') {
            const tx = await retry(
              () => wallet.sendTransaction({
                to: targetAddress,
                value: amountPerSender
              }),
              retryCount
            );
            await tx.wait();
            return { success: true, hash: tx.hash };
          } else {
            const contract = new ethers.Contract(tokenContract, ERC20_ABI, wallet);
            const tx = await retry(
              () => contract.transfer(targetAddress, amountPerSender),
              retryCount
            );
            await tx.wait();
            return { success: true, hash: tx.hash };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      });
    }
  }

  // Execute with concurrency control
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);
  }

  return results;
}

// Start application
mainMenu().catch(error => {
  console.error(chalk.red(`${EMOJIS.error} Fatal Error: ${error.message}`));
  process.exit(1);
});
