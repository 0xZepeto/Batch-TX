const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const ethers = require('ethers');

// ANSI Art Zepeto Bot yang simetris
const showHeader = () => {
  console.clear();
  
  const zepetoArt = [
    "████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ ██████╗ ",
    "╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔═══██╗",
    "   ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║██║   ██║",
    "   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██║   ██║",
    "   ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝",
    "   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ",
    "                                                            ",
    "███████╗████████╗██╗   ██╗██╗     ███████╗                 ",
    "██╔════╝╚══██╔══╝╚██╗ ██╔╝██║     ██╔════╝                 ",
    "███████╗   ██║    ╚████╔╝ ██║     █████╗                   ",
    "╚════██║   ██║     ╚██╔╝  ██║     ██╔══╝                   ",
    "███████║   ██║      ██║   ███████╗███████╗                 ",
    "╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝                 "
  ];

  const maxWidth = Math.max(...zepetoArt.map(line => line.length));
  const border = "═".repeat(maxWidth + 4);
  const padding = " ".repeat(Math.floor((maxWidth - 28) / 2)); // 28 = panjang "Batch Transaction Sender"

  let header = chalk.cyan(`╔${border}╗\n`);
  
  zepetoArt.forEach(line => {
    const paddedLine = line.padEnd(maxWidth, ' ');
    header += chalk.cyan(`║ ${chalk.green(paddedLine)} ║\n`);
  });
  
  header += chalk.cyan(`║ ${" ".repeat(maxWidth)} ║\n`);
  header += chalk.cyan(`║ ${padding}${chalk.yellow.bold("Batch Transaction Sender")}${padding} ║\n`);
  header += chalk.cyan(`║ ${" ".repeat(maxWidth)} ║\n`);
  header += chalk.cyan(`╚${border}╝\n`);
  header += chalk.gray('='.repeat(maxWidth + 6));
  
  console.log(header);
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
  console.log(chalk.gray('─'.repeat(60)));
  console.log(`${chalk.cyan.bold('Jaringan:')}         ${details.network}`);
  console.log(`${chalk.cyan.bold('Jenis Token:')}      ${details.tokenType}`);
  console.log(`${chalk.cyan.bold('Mode:')}             ${details.mode}`);
  
  if (details.tokenType === 'erc20') {
    console.log(`${chalk.cyan.bold('Kontrak Token:')}    ${details.tokenContract.substring(0, 6)}...${details.tokenContract.substring(details.tokenContract.length - 4)}`);
  }
  
  console.log(`${chalk.cyan.bold('Total Pengirim:')}    ${details.totalSenders}`);
  console.log(`${chalk.cyan.bold('Total Penerima:')}    ${details.totalReceivers}`);
  console.log(`${chalk.cyan.bold('Jumlah per Tx:')}     ${details.amountPerTx}`);
  console.log(chalk.gray('─'.repeat(60)));
  
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

// Menampilkan tabel transaksi
const showTransactionTable = (transactions) => {
  console.log(chalk.blue.bold('\n📊 Ringkasan Transaksi:'));
  console.log(chalk.gray('─'.repeat(80)));
  
  const headers = ['No', 'Dari', 'Ke', 'Jumlah', 'Status', 'TX Hash'];
  const columnWidths = [5, 20, 20, 15, 10, 30];
  
  // Print header
  let headerLine = '';
  headers.forEach((header, i) => {
    headerLine += chalk.cyan.bold(header.padEnd(columnWidths[i]));
  });
  console.log(headerLine);
  console.log(chalk.gray('─'.repeat(80)));
  
  // Print rows
  transactions.forEach((tx, index) => {
    const row = [
      (index + 1).toString().padEnd(columnWidths[0]),
      (tx.from ? tx.from.substring(0, 6) + '...' + tx.from.substring(tx.from.length - 4) : '-').padEnd(columnWidths[1]),
      (tx.to ? tx.to.substring(0, 6) + '...' + tx.to.substring(tx.to.length - 4) : '-').padEnd(columnWidths[2]),
      tx.amount.padEnd(columnWidths[3]),
      tx.status === 'success' ? chalk.green('✓ Sukses') : chalk.red('✗ Gagal'),
      (tx.hash ? tx.hash.substring(0, 10) + '...' : '-').padEnd(columnWidths[5])
    ];
    
    console.log(row.join(''));
  });
  
  console.log(chalk.gray('─'.repeat(80)));
};

// Menampilkan progress bar
const showProgressBar = (current, total, size = 30) => {
  const percent = Math.floor((current / total) * 100);
  const filled = Math.floor(size * (current / total));
  const bar = '█'.repeat(filled) + '░'.repeat(size - filled);
  
  process.stdout.write(`\r${chalk.blue('[')}${chalk.green(bar)}${chalk.blue(']')} ${chalk.yellow(percent.toString().padStart(3))}% ${chalk.gray(`(${current}/${total}`)})`);
  
  if (current === total) {
    process.stdout.write('\n');
  }
};

// Menampilkan animasi loading kustom
const showCustomLoader = (message) => {
  const frames = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'];
  let i = 0;
  
  return setInterval(() => {
    process.stdout.write(`\r${chalk.blue(frames[i++ % frames.length])} ${chalk.gray(message)}`);
  }, 100);
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
  showWarning,
  showTransactionTable,
  showProgressBar,
  showCustomLoader
};
