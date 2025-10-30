const ethers = require('ethers');
const utils = require('./utils');
const readline = require('readline-sync');

async function main() {
    console.log('=== BATCH TRANSACTION TOOL ===');
    const network = utils.selectNetwork();
    
    console.log('\nPilih opsi:');
    console.log('1. KIRIM NATIVE TOKEN');
    console.log('2. KIRIM ERC20/BEP20 TOKEN');
    const choice = readline.question('Masukkan nomor opsi: ');

    if (choice === '1') {
        await sendNative(network);
    } else if (choice === '2') {
        await sendToken(network);
    } else {
        console.log('Opsi tidak valid.');
    }
}

async function sendNative(network) {
    const privateKeys = utils.readFile('privatekey.txt');
    if (privateKeys.length === 0) {
        console.log('Tidak ada private key di privatekey.txt');
        return;
    }

    const amount = readline.question('Masukkan jumlah kirim (dalam satuan token): ');
    
    console.log('\nPilih mode pengiriman:');
    console.log('1. Satu akun ke banyak alamat (singleaddress.txt)');
    console.log('2. Banyak akun ke satu alamat');
    console.log('3. Kirim semua saldo (split otomatis)');
    const mode = readline.question('Masukkan nomor mode: ');

    if (mode === '1') {
        const addresses = utils.readFile('singleaddress.txt'); // DIUBAH DI SINI
        if (addresses.length === 0) {
            console.log('Tidak ada alamat di singleaddress.txt');
            return;
        }
        
        const wallet = utils.createWallet(privateKeys[0], network.rpc);
        for (const addr of addresses) {
            try {
                console.log(`Mengirim ${amount} ke ${addr}...`);
                const tx = await utils.sendNative(wallet, addr, amount);
                await utils.sendWithRetry(wallet, tx);
                console.log(`Berhasil mengirim ke ${addr}`);
            } catch (error) {
                console.error(`Gagal mengirim ke ${addr}:`, error.message);
            }
        }
    } 
    else if (mode === '2') {
        console.log('\nPilih sumber address tujuan:');
        console.log('1. Dari file received.txt');
        console.log('2. Input manual');
        const sourceChoice = readline.question('Masukkan nomor pilihan: ');
        
        let receiver;
        if (sourceChoice === '1') {
            receiver = utils.readFile('received.txt')[0];
            if (!receiver) {
                console.log('Tidak ada alamat penerima di received.txt');
                return;
            }
            console.log(`Address tujuan dari file: ${receiver}`);
        } else if (sourceChoice === '2') {
            receiver = readline.question('Masukkan address tujuan: ');
            if (!ethers.isAddress(receiver)) {
                console.log('Address tidak valid!');
                return;
            }
            console.log(`Address tujuan manual: ${receiver}`);
        } else {
            console.log('Pilihan tidak valid');
            return;
        }
        
        for (const pk of privateKeys) {
            try {
                const wallet = utils.createWallet(pk, network.rpc);
                console.log(`Mengirim ${amount} dari ${wallet.address} ke ${receiver}...`);
                const tx = await utils.sendNative(wallet, receiver, amount);
                await utils.sendWithRetry(wallet, tx);
                console.log(`Berhasil mengirim dari ${wallet.address}`);
            } catch (error) {
                console.error(`Gagal mengirim dari ${pk.substring(0, 6)}...:`, error.message);
            }
        }
    } 
    else if (mode === '3') {
        console.log('\nPilih sumber address tujuan:');
        console.log('1. Dari file received.txt');
        console.log('2. Input manual');
        const sourceChoice = readline.question('Masukkan nomor pilihan: ');
        
        let receiver;
        if (sourceChoice === '1') {
            receiver = utils.readFile('received.txt')[0];
            if (!receiver) {
                console.log('Tidak ada alamat penerima di received.txt');
                return;
            }
            console.log(`Address tujuan dari file: ${receiver}`);
        } else if (sourceChoice === '2') {
            receiver = readline.question('Masukkan address tujuan: ');
            if (!ethers.isAddress(receiver)) {
                console.log('Address tidak valid!');
                return;
            }
            console.log(`Address tujuan manual: ${receiver}`);
        } else {
            console.log('Pilihan tidak valid');
            return;
        }
        
        console.log('\nPilih metode split:');
        console.log('1. Rata-rata (sama untuk semua akun)');
        console.log('2. Custom (sesuai split.txt)');
        const splitMode = readline.question('Masukkan nomor metode: ');
        
        if (splitMode === '1') {
            for (const pk of privateKeys) {
                try {
                    const wallet = utils.createWallet(pk, network.rpc);
                    const balance = await utils.getNativeBalance(wallet);
                    const amountToSend = (parseFloat(balance) - 0.001).toString(); // Sisakan untuk gas
                    
                    console.log(`Mengirim ${amountToSend} dari ${wallet.address} ke ${receiver}...`);
                    const tx = await utils.sendNative(wallet, receiver, amountToSend);
                    await utils.sendWithRetry(wallet, tx);
                    console.log(`Berhasil mengirim dari ${wallet.address}`);
                } catch (error) {
                    console.error(`Gagal mengirim dari ${pk.substring(0, 6)}...:`, error.message);
                }
            }
        } 
        else if (splitMode === '2') {
            const splitAmounts = utils.readFile('split.txt');
            if (splitAmounts.length !== privateKeys.length) {
                console.log('Jumlah baris di split.txt harus sama dengan privatekey.txt');
                return;
            }
            
            for (let i = 0; i < privateKeys.length; i++) {
                try {
                    const wallet = utils.createWallet(privateKeys[i], network.rpc);
                    const amountToSend = splitAmounts[i];
                    
                    console.log(`Mengirim ${amountToSend} dari ${wallet.address} ke ${receiver}...`);
                    const tx = await utils.sendNative(wallet, receiver, amountToSend);
                    await utils.sendWithRetry(wallet, tx);
                    console.log(`Berhasil mengirim dari ${wallet.address}`);
                } catch (error) {
                    console.error(`Gagal mengirim dari ${privateKeys[i].substring(0, 6)}...:`, error.message);
                }
            }
        }
    }
}

async function sendToken(network) {
    const privateKeys = utils.readFile('privatekey.txt');
    if (privateKeys.length === 0) {
        console.log('Tidak ada private key di privatekey.txt');
        return;
    }

    const tokenAddress = readline.question('Masukkan Smart Contract token: ');
    const amount = readline.question('Masukkan jumlah token: ');
    
    const sampleWallet = utils.createWallet(privateKeys[0], network.rpc);
    const tokenContract = utils.createTokenContract(tokenAddress, sampleWallet);
    const decimals = await tokenContract.decimals();

    console.log('\nPilih mode pengiriman:');
    console.log('1. Satu akun ke banyak alamat (singleaddress.txt)');
    console.log('2. Banyak akun ke satu alamat');
    console.log('3. Kirim semua saldo (split otomatis)');
    const mode = readline.question('Masukkan nomor mode: ');

    if (mode === '1') {
        const addresses = utils.readFile('singleaddress.txt'); // DIUBAH DI SINI
        if (addresses.length === 0) {
            console.log('Tidak ada alamat di singleaddress.txt');
            return;
        }
        
        const wallet = utils.createWallet(privateKeys[0], network.rpc);
        const contract = utils.createTokenContract(tokenAddress, wallet);
        for (const addr of addresses) {
            try {
                console.log(`Mengirim ${amount} token ke ${addr}...`);
                const tx = await utils.sendToken(contract, addr, amount, decimals);
                await utils.sendWithRetry(wallet, tx);
                console.log(`Berhasil mengirim ke ${addr}`);
            } catch (error) {
                console.error(`Gagal mengirim ke ${addr}:`, error.message);
            }
        }
    } 
    else if (mode === '2') {
        console.log('\nPilih sumber address tujuan:');
        console.log('1. Dari file received.txt');
        console.log('2. Input manual');
        const sourceChoice = readline.question('Masukkan nomor pilihan: ');
        
        let receiver;
        if (sourceChoice === '1') {
            receiver = utils.readFile('received.txt')[0];
            if (!receiver) {
                console.log('Tidak ada alamat penerima di received.txt');
                return;
            }
            console.log(`Address tujuan dari file: ${receiver}`);
        } else if (sourceChoice === '2') {
            receiver = readline.question('Masukkan address tujuan: ');
            if (!ethers.isAddress(receiver)) {
                console.log('Address tidak valid!');
                return;
            }
            console.log(`Address tujuan manual: ${receiver}`);
        } else {
            console.log('Pilihan tidak valid');
            return;
        }
        
        for (const pk of privateKeys) {
            try {
                const wallet = utils.createWallet(pk, network.rpc);
                const contract = utils.createTokenContract(tokenAddress, wallet);
                
                console.log(`Mengirim ${amount} token dari ${wallet.address} ke ${receiver}...`);
                const tx = await utils.sendToken(contract, receiver, amount, decimals);
                await utils.sendWithRetry(wallet, tx);
                console.log(`Berhasil mengirim dari ${wallet.address}`);
            } catch (error) {
                console.error(`Gagal mengirim dari ${pk.substring(0, 6)}...:`, error.message);
            }
        }
    } 
    else if (mode === '3') {
        console.log('\nPilih sumber address tujuan:');
        console.log('1. Dari file received.txt');
        console.log('2. Input manual');
        const sourceChoice = readline.question('Masukkan nomor pilihan: ');
        
        let receiver;
        if (sourceChoice === '1') {
            receiver = utils.readFile('received.txt')[0];
            if (!receiver) {
                console.log('Tidak ada alamat penerima di received.txt');
                return;
            }
            console.log(`Address tujuan dari file: ${receiver}`);
        } else if (sourceChoice === '2') {
            receiver = readline.question('Masukkan address tujuan: ');
            if (!ethers.isAddress(receiver)) {
                console.log('Address tidak valid!');
                return;
            }
            console.log(`Address tujuan manual: ${receiver}`);
        } else {
            console.log('Pilihan tidak valid');
            return;
        }
        
        console.log('\nPilih metode split:');
        console.log('1. Rata-rata (sama untuk semua akun)');
        console.log('2. Custom (sesuai split.txt)');
        const splitMode = readline.question('Masukkan nomor metode: ');
        
        if (splitMode === '1') {
            for (const pk of privateKeys) {
                try {
                    const wallet = utils.createWallet(pk, network.rpc);
                    const contract = utils.createTokenContract(tokenAddress, wallet);
                    const balance = await utils.getTokenBalance(wallet, contract);
                    const amountToSend = ethers.formatUnits(balance, decimals);
                    
                    console.log(`Mengirim ${amountToSend} token dari ${wallet.address} ke ${receiver}...`);
                    const tx = await utils.sendToken(contract, receiver, amountToSend, decimals);
                    await utils.sendWithRetry(wallet, tx);
                    console.log(`Berhasil mengirim dari ${wallet.address}`);
                } catch (error) {
                    console.error(`Gagal mengirim dari ${pk.substring(0, 6)}...:`, error.message);
                }
            }
        } 
        else if (splitMode === '2') {
            const splitAmounts = utils.readFile('split.txt');
            if (splitAmounts.length !== privateKeys.length) {
                console.log('Jumlah baris di split.txt harus sama dengan privatekey.txt');
                return;
            }
            
            for (let i = 0; i < privateKeys.length; i++) {
                try {
                    const wallet = utils.createWallet(privateKeys[i], network.rpc);
                    const contract = utils.createTokenContract(tokenAddress, wallet);
                    const amountToSend = splitAmounts[i];
                    
                    console.log(`Mengirim ${amountToSend} token dari ${wallet.address} ke ${receiver}...`);
                    const tx = await utils.sendToken(contract, receiver, amountToSend, decimals);
                    await utils.sendWithRetry(wallet, tx);
                    console.log(`Berhasil mengirim dari ${wallet.address}`);
                } catch (error) {
                    console.error(`Gagal mengirim dari ${privateKeys[i].substring(0, 6)}...:`, error.message);
                }
            }
        }
    }
}

main().catch(console.error);
