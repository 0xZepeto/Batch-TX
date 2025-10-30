const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

// Header animasi
const showHeader = () => {
  console.clear();
  console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ${chalk.green('██████╗ ███████╗████████╗██████╗  ██████╗ ████████╗')}   ║
║   ${chalk.green('██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗╚══██╔══╝}   ║
║   ${chalk.green('██████╔╝█████╗     ██║   ██████╔╝██║   ██║   ██║      ║
║   ${chalk.green('██╔══██╗██╔══╝     ██║   ██╔══██╗██║   ██║   ██║      ║
║   ${chalk.green('██████╔╝███████╗   ██║   ██║  ██║╚██████╔╝   ██║      ║
║   ${chalk.green('╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝    ╚═╝      ║
║                                                              ║
║                    ${chalk.yellow('Batch Transaction Sender')}                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`));
};

// Pilihan jaringan
const selectNetwork = async (networks) => {
  const { network } = await inquirer.prompt([
    {
      type: 'list',
      name: 'network',
      message: chalk.blue('Pilih Jaringan:'),
      choices: networks.map((net, index) => ({
        name: `${chalk.green(index + 1)}. ${net.name} (${net.symbol})`,
        value: net
      })),
      pageSize: 10
    }
  ]);
  
  return network;
};

// Pilihan jenis token
const selectTokenType = async () => {
  const { tokenType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tokenType',
      message: chalk.blue('Pilih Jenis Token:'),
      choices: [
        { name: chalk.green('1. Native Token'), value: 'native' },
        { name: chalk.green('2. ERC20/BEP20 Token'), value: 'erc20' }
      ]
    }
  ]);
  
  return tokenType;
};

// Pilihan mode pengiriman
const selectSendMode = async () => {
  const { sendMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'sendMode',
      message: chalk.blue('Pilih Mode Pengiriman:'),
      choices: [
        { name: chalk.green('1. 1 Address → Banyak Address'), value: 'oneToMany' },
        { name: chalk.green('2. Banyak Address → 1 Address'), value: 'manyToOne' },
        { name: chalk.green('3. Bagi Saldo Otomatis'), value: 'splitBalance' }
      ]
    }
  ]);
  
  return sendMode;
};

// Input jumlah
const inputAmount = async (message) => {
  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: chalk.blue(message),
      validate: (value) => {
        return !isNaN(parseFloat(value)) || 'Masukkan angka yang valid!';
      }
    }
  ]);
  
  return parseFloat(amount);
};

// Input alamat tujuan
const inputDestination = async () => {
  const { destination } = await inquirer.prompt([
    {
      type: 'input',
      name: 'destination',
      message: chalk.blue('Masukkan Alamat Tujuan:'),
      validate: (value) => {
        return ethers.isAddress(value) || 'Alamat tidak valid!';
      }
    }
  ]);
  
  return destination;
};

// Input kontrak token
const inputTokenContract = async () => {
  const { tokenContract } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenContract',
      message: chalk.blue('Masukkan Alamat Kontrak Token:'),
      validate: (value) => {
        return ethers.isAddress(value) || 'Alamat kontrak tidak valid!';
      }
    }
  ]);
  
  return tokenContract;
};

// Konfirmasi transaksi
const confirmTransaction = async (details) => {
  console.log(chalk.yellow('\nDetail Transaksi:'));
  console.log(chalk.cyan(`Jaringan: ${details.network}`));
  console.log(chalk.cyan(`Jenis Token: ${details.tokenType}`));
  console.log(chalk.cyan(`Mode: ${details.mode}`));
  
  if (details.tokenType === 'erc20') {
    console.log(chalk.cyan(`Kontrak Token: ${details.tokenContract}`));
  }
  
  console.log(chalk.cyan(`Total Pengirim: ${details.totalSenders}`));
  console.log(chalk.cyan(`Total Penerima: ${details.totalReceivers}`));
  console.log(chalk.cyan(`Jumlah per Transaksi: ${details.amountPerTx}`));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.blue('Lanjutkan transaksi?'),
      default: false
    }
  ]);
  
  return confirm;
};

// Spinner untuk loading
const spinner = (text) => {
  return ora({
    text: chalk.blue(text),
    spinner: 'dots',
    color: 'cyan'
  });
};

module.exports = {
  showHeader,
  selectNetwork,
  selectTokenType,
  selectSendMode,
  inputAmount,
  inputDestination,
  inputTokenContract,
  confirmTransaction,
  spinner
};
