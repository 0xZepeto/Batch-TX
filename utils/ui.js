const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const ethers = require('ethers');

// Header animasi yang lebih rapi
const showHeader = () => {
  console.clear();
  console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ${chalk.green('██████╗ ███████╗████████╗██████╗  ██████╗ ████████╗')}   ║
║   ${chalk.green('██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗╚══██╔══╝')}   ║
║   ${chalk.green('██████╔╝█████╗     ██║   ██████╔╝██║   ██║   ██║')}      ║
║   ${chalk.green('██╔══██╗██╔══╝     ██║   ██╔══██╗██║   ██║   ██║')}      ║
║   ${chalk.green('██████╔╝███████╗   ██║   ██║  ██║╚██████╔╝   ██║')}      ║
║   ${chalk.green('╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝    ╚═╝')}      ║
║                                                              ║
║                    ${chalk.yellow('Batch Transaction Sender')}                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`));
  console.log(chalk.gray('='.repeat(60)));
};

// Pilihan jaringan dengan tampilan lebih menarik
const selectNetwork = async (networks) => {
  console.log(chalk.blue.bold('\n🌐 Pilih Jaringan:'));
  const { network } = await inquirer.prompt([
    {
      type: 'list',
      name: 'network',
      message: chalk.blue('Pilih jaringan yang akan digunakan:'),
      choices: networks.map((net, index) => ({
        name: `${chalk.green.bold(index + 1)}. ${net.name} (${chalk.yellow(net.symbol)})`,
        value: net,
        short: net.name
      })),
      pageSize: 10,
      loop: false
    }
  ]);
  
  return network;
};

// Pilihan jenis token dengan ikon
const selectTokenType = async () => {
  console.log(chalk.blue.bold('\n💰 Pilih Jenis Token:'));
  const { tokenType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tokenType',
      message: chalk.blue('Pilih jenis token yang akan dikirim:'),
      choices: [
        { 
          name: `${chalk.green.bold('1. Native Token')} ${chalk.gray('(ETH, BNB, MATIC, dll)')}`, 
          value: 'native',
          short: 'Native Token'
        },
        { 
          name: `${chalk.green.bold('2. ERC20/BEP20 Token')} ${chalk.gray('(Token Standar)')}`, 
          value: 'erc20',
          short: 'ERC20/BEP20'
        }
      ]
    }
  ]);
  
  return tokenType;
};

// Pilihan mode pengiriman dengan deskripsi
const selectSendMode = async () => {
  console.log(chalk.blue.bold('\n📤 Pilih Mode Pengiriman:'));
  const { sendMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'sendMode',
      message: chalk.blue('Pilih mode pengiriman:'),
      choices: [
        { 
          name: `${chalk.green.bold('1. 1 Address → Banyak Address')} ${chalk.gray('(Dari satu akun ke banyak penerima)')}`, 
          value: 'oneToMany',
          short: '1 → Banyak'
        },
        { 
          name: `${chalk.green.bold('2. Banyak Address → 1 Address')} ${chalk.gray('(Dari banyak akun ke satu penerima)')}`, 
          value: 'manyToOne',
          short: 'Banyak → 1'
        },
        { 
          name: `${chalk.green.bold('3. Bagi Saldo Otomatis')} ${chalk.gray('(Bagi rata saldo ke semua alamat)')}`, 
          value: 'splitBalance',
          short: 'Bagi Saldo'
        }
      ]
    }
  ]);
  
  return sendMode;
};

// Input jumlah dengan format yang lebih jelas
const inputAmount = async (message) => {
  console.log(chalk.blue.bold('\n💸 Masukkan Jumlah:'));
  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: chalk.blue(message),
      validate: (value) => {
        if (isNaN(parseFloat(value))) {
          return chalk.red('⚠️ Masukkan angka yang valid!');
        }
        if (parseFloat(value) <= 0) {
          return chalk.red('⚠️ Jumlah harus lebih dari 0!');
        }
        return true;
      },
      filter: (value) => parseFloat(value)
    }
  ]);
  
  return amount;
};

// Input alamat tujuan dengan validasi
const inputDestination = async () => {
  console.log(chalk.blue.bold('\n🏠 Masukkan Alamat Tujuan:'));
  const { destination } = await inquirer.prompt([
    {
      type: 'input',
      name: 'destination',
      message: chalk.blue('Alamat tujuan pengiriman:'),
      validate: (value) => {
        if (!ethers.isAddress(value)) {
          return chalk.red('⚠️ Alamat tidak valid!');
        }
        return true;
      },
      transformer: (value) => {
        return chalk.gray(value.substring(0, 6) + '...' + value.substring(value.length - 4));
      }
    }
  ]);
  
  return destination;
};

// Input kontrak token dengan validasi
const inputTokenContract = async () => {
  console.log(chalk.blue.bold('\n📜 Masukkan Alamat Kontrak Token:'));
  const { tokenContract } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenContract',
      message: chalk.blue('Alamat kontrak token:'),
      validate: (value) => {
        if (!ethers.isAddress(value)) {
          return chalk.red('⚠️ Alamat kontrak tidak valid!');
        }
        return true;
      },
      transformer: (value) => {
        return chalk.gray(value.substring(0, 6) + '...' + value.substring(value.length - 4));
      }
    }
  ]);
  
  return tokenContract;
};

// Konfirmasi transaksi dengan tampilan tabel
const confirmTransaction = async (details) => {
  console.log(chalk.yellow.bold('\n📋 Detail Transaksi:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.cyan.bold('Jaringan:')}         ${details.network}`);
  console.log(`${chalk.cyan.bold('Jenis Token:')}      ${details.tokenType}`);
  console.log(`${chalk.cyan.bold('Mode:')}             ${details.mode}`);
  
  if (details.tokenType === 'erc20') {
    console.log(`${chalk.cyan.bold('Kontrak Token:')}    ${details.tokenContract.substring(0, 6)}...${details.tokenContract.substring(details.tokenContract.length - 4)}`);
  }
  
  console.log(`${chalk.cyan.bold('Total Pengirim:')}    ${details.totalSenders}`);
  console.log(`${chalk.cyan.bold('Total Penerima:')}    ${details.totalReceivers}`);
  console.log(`${chalk.cyan.bold('Jumlah per Tx:')}     ${details.amountPerTx}`);
  console.log(chalk.gray('─'.repeat(50)));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.blue('Lanjutkan transaksi?'),
      default: false,
      prefix: chalk.yellow('❓')
    }
  ]);
  
  return confirm;
};

// Spinner untuk loading dengan pilihan animasi
const spinner = (text) => {
  return ora({
    text: chalk.blue(text),
    spinner: {
      interval: 80,
      frames: [
        '⠋',
        '⠙',
        '⠹',
        '⠸',
        '⠼',
        '⠴',
        '⠦',
        '⠧',
        '⠇',
        '⠏'
      ]
    },
    color: 'cyan',
    indent: 2
  });
};

// Menampilkan pesan sukses dengan gaya
const showSuccess = (message) => {
  console.log(chalk.green.bold('\n✅ ' + message));
};

// Menampilkan pesan error dengan gaya
const showError = (message) => {
  console.log(chalk.red.bold('\n❌ ' + message));
};

// Menampilkan pesan informasi dengan gaya
const showInfo = (message) => {
  console.log(chalk.blue.bold('\nℹ️  ' + message));
};

// Menampilkan pesan peringatan dengan gaya
const showWarning = (message) => {
  console.log(chalk.yellow.bold('\n⚠️  ' + message));
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
  spinner,
  showSuccess,
  showError,
  showInfo,
  showWarning
};
