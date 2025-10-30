const ethers = require('ethers');
const fs = require('fs');
const { 
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
} = require('./utils/ui');
const { 
  readFile, 
  isValidAddress, 
  isValidPrivateKey,
  formatUnits,
  parseUnits
} = require('./utils/helpers');
const { 
  sendNative, 
  sendToken, 
  getNativeBalance, 
  getTokenBalance 
} = require('./utils/transaction');

// Fungsi utama
const main = async () => {
  showHeader();
  
  // Baca file konfigurasi
  const networks = JSON.parse(fs.readFileSync('rpc.json', 'utf8'));
  const privateKeys = readFile('privatekeys.txt');
  const addresses = readFile('address.txt');
  
  // Validasi private keys
  const validPrivateKeys = privateKeys.filter(pk => isValidPrivateKey(pk));
  if (validPrivateKeys.length === 0) {
    showError('Tidak ada private key valid!');
    process.exit(1);
  }
  
  // Pilih jaringan
  const selectedNetwork = await selectNetwork(networks);
  const provider = new ethers.JsonRpcProvider(selectedNetwork.rpc);
  
  // Pilih jenis token
  const tokenType = await selectTokenType();
  
  // Pilih mode pengiriman
  const sendMode = await selectSendMode();
  
  let tokenContract, amount, destination;
  let totalSenders = 0, totalReceivers = 0;
  
  // Input data berdasarkan mode
  if (tokenType === 'erc20') {
    tokenContract = await inputTokenContract();
  }
  
  if (sendMode === 'splitBalance') {
    // Mode bagi saldo otomatis
    totalSenders = validPrivateKeys.length;
    totalReceivers = addresses.length;
    
    // Konfirmasi transaksi
    const confirm = await confirmTransaction({
      network: selectedNetwork.name,
      tokenType: tokenType === 'native' ? 'Native Token' : 'ERC20/BEP20',
      mode: 'Bagi Saldo Otomatis',
      tokenContract: tokenContract || '-',
      totalSenders,
      totalReceivers,
      amountPerTx: 'Otomatis'
    });
    
    if (!confirm) {
      showWarning('Transaksi dibatalkan.');
      return;
    }
    
    // Proses transaksi
    await processSplitBalance(
      provider, 
      validPrivateKeys, 
      addresses, 
      selectedNetwork, 
      tokenType, 
      tokenContract
    );
    
  } else {
    // Mode input manual
    amount = await inputAmount('Masukkan jumlah yang akan dikirim:');
    
    if (sendMode === 'oneToMany') {
      totalSenders = 1;
      totalReceivers = addresses.length;
      
      // Konfirmasi transaksi
      const confirm = await confirmTransaction({
        network: selectedNetwork.name,
        tokenType: tokenType === 'native' ? 'Native Token' : 'ERC20/BEP20',
        mode: '1 Address → Banyak Address',
        tokenContract: tokenContract || '-',
        totalSenders,
        totalReceivers,
        amountPerTx: amount
      });
      
      if (!confirm) {
        showWarning('Transaksi dibatalkan.');
        return;
      }
      
      // Proses transaksi
      await processOneToMany(
        provider, 
        validPrivateKeys[0], 
        addresses, 
        selectedNetwork, 
        tokenType, 
        tokenContract, 
        amount
      );
      
    } else if (sendMode === 'manyToOne') {
      destination = await inputDestination();
      totalSenders = validPrivateKeys.length;
      totalReceivers = 1;
      
      // Konfirmasi transaksi
      const confirm = await confirmTransaction({
        network: selectedNetwork.name,
        tokenType: tokenType === 'native' ? 'Native Token' : 'ERC20/BEP20',
        mode: 'Banyak Address → 1 Address',
        tokenContract: tokenContract || '-',
        totalSenders,
        totalReceivers,
        amountPerTx: amount
      });
      
      if (!confirm) {
        showWarning('Transaksi dibatalkan.');
        return;
      }
      
      // Proses transaksi
      await processManyToOne(
        provider, 
        validPrivateKeys, 
        destination, 
        selectedNetwork, 
        tokenType, 
        tokenContract, 
        amount
      );
    }
  }
};

// Proses 1 ke banyak dengan tampilan lebih baik
const processOneToMany = async (
  provider, 
  privateKey, 
  receivers, 
  network, 
  tokenType, 
  tokenContract, 
  amount
) => {
  const wallet = new ethers.Wallet(privateKey, provider);
  const loadSpinner = spinner(`Mengirim ${tokenType === 'native' ? network.symbol : 'Token'}...`);
  loadSpinner.start();
  
  try {
    let successCount = 0;
    for (const receiver of receivers) {
      if (!isValidAddress(receiver)) continue;
      
      let tx;
      if (tokenType === 'native') {
        tx = await sendNative(provider, wallet, receiver, amount);
      } else {
        tx = await sendToken(provider, wallet, tokenContract, receiver, amount);
      }
      
      await tx.wait();
      successCount++;
      showSuccess(`✅ ${successCount}/${receivers.length} Berhasil kirim ke ${receiver.substring(0,6)}...${receiver.substring(receiver.length-4)}`);
      console.log(chalk.gray(`   TX: ${network.explorer}/tx/${tx.hash}`));
    }
    
    loadSpinner.succeed(chalk.green(`Semua transaksi berhasil! (${successCount}/${receivers.length})`));
  } catch (error) {
    loadSpinner.fail(chalk.red('Transaksi gagal: ' + error.message));
  }
};

// Proses banyak ke 1 dengan tampilan lebih baik
const processManyToOne = async (
  provider, 
  privateKeys, 
  destination, 
  network, 
  tokenType, 
  tokenContract, 
  amount
) => {
  const loadSpinner = spinner(`Mengirim ${tokenType === 'native' ? network.symbol : 'Token'}...`);
  loadSpinner.start();
  
  try {
    let successCount = 0;
    const promises = privateKeys.map(async (privateKey) => {
      const wallet = new ethers.Wallet(privateKey, provider);
      
      let tx;
      if (tokenType === 'native') {
        tx = await sendNative(provider, wallet, destination, amount);
      } else {
        tx = await sendToken(provider, wallet, tokenContract, destination, amount);
      }
      
      await tx.wait();
      successCount++;
      showSuccess(`✅ ${successCount}/${privateKeys.length} Berhasil kirim dari ${wallet.address.substring(0,6)}...${wallet.address.substring(wallet.address.length-4)}`);
      console.log(chalk.gray(`   TX: ${network.explorer}/tx/${tx.hash}`));
      return tx;
    });
    
    await Promise.all(promises);
    loadSpinner.succeed(chalk.green(`Semua transaksi berhasil! (${successCount}/${privateKeys.length})`));
  } catch (error) {
    loadSpinner.fail(chalk.red('Transaksi gagal: ' + error.message));
  }
};

// Proses bagi saldo otomatis dengan tampilan lebih baik
const processSplitBalance = async (
  provider, 
  privateKeys, 
  receivers, 
  network, 
  tokenType, 
  tokenContract
) => {
  const loadSpinner = spinner(`Membagi saldo ${tokenType === 'native' ? network.symbol : 'Token'}...`);
  loadSpinner.start();
  
  try {
    let totalSuccess = 0;
    const totalTxs = privateKeys.length * receivers.length;
    
    const promises = privateKeys.map(async (privateKey) => {
      const wallet = new ethers.Wallet(privateKey, provider);
      
      let balance, amountPerReceiver;
      if (tokenType === 'native') {
        balance = await getNativeBalance(provider, wallet.address);
        amountPerReceiver = parseFloat(balance) / receivers.length;
      } else {
        balance = await getTokenBalance(provider, tokenContract, wallet.address);
        amountPerReceiver = parseFloat(balance) / receivers.length;
      }
      
      const receiverPromises = receivers.map(async (receiver) => {
        if (!isValidAddress(receiver)) return;
        
        let tx;
        if (tokenType === 'native') {
          tx = await sendNative(provider, wallet, receiver, amountPerReceiver);
        } else {
          tx = await sendToken(provider, wallet, tokenContract, receiver, amountPerReceiver);
        }
        
        await tx.wait();
        totalSuccess++;
        showSuccess(`✅ ${totalSuccess}/${totalTxs} Berhasil kirim dari ${wallet.address.substring(0,6)}... ke ${receiver.substring(0,6)}...`);
        console.log(chalk.gray(`   TX: ${network.explorer}/tx/${tx.hash}`));
        return tx;
      });
      
      return Promise.all(receiverPromises);
    });
    
    await Promise.all(promises);
    loadSpinner.succeed(chalk.green(`Pembagian saldo berhasil! (${totalSuccess}/${totalTxs} transaksi)`));
  } catch (error) {
    loadSpinner.fail(chalk.red('Transaksi gagal: ' + error.message));
  }
};

// Jalankan aplikasi
main().catch(err => {
  console.error(chalk.red('Error:'), err);
  process.exit(1);
});
