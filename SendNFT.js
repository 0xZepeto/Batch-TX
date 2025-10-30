const ethers = require('ethers');
const utils = require('./utils');
const readline = require('readline-sync');

async function main() {
    console.log('=== NFT TRANSFER TOOL ===');
    const network = utils.selectNetwork();
    
    const nftAddress = readline.question('Masukkan Smart Contract NFT: ');
    const privateKeys = utils.readFile('pknft.txt');
    const receivers = utils.readFile('receivednft.txt');
    
    if (privateKeys.length === 0) {
        console.log('Tidak ada private key di pknft.txt');
        return;
    }
    
    if (receivers.length === 0) {
        console.log('Tidak ada alamat penerima di receivednft.txt');
        return;
    }

    console.log('\nPilih mode token ID:');
    console.log('1. Deteksi otomatis dari setiap akun');
    console.log('2. Gunakan idnft.txt (manual)');
    const mode = readline.question('Masukkan nomor mode: ');

    for (let i = 0; i < privateKeys.length; i++) {
        const pk = privateKeys[i];
        const wallet = utils.createWallet(pk, network.rpc);
        const receiver = receivers.length > i ? receivers[i] : receivers[receivers.length - 1];
        
        let tokenId;
        try {
            if (mode === '1') {
                console.log(`Mendeteksi NFT di ${wallet.address}...`);
                const tokenIds = await utils.getNFTTokenIds(nftAddress, wallet.address);
                if (tokenIds.length === 0) {
                    console.log(`Tidak ada NFT ditemukan di ${wallet.address}`);
                    continue;
                }
                tokenId = tokenIds[0];
                console.log(`Token ID terdeteksi: ${tokenId}`);
            } else {
                const tokenIds = utils.readFile('idnft.txt');
                if (i >= tokenIds.length) {
                    console.log(`Tidak ada token ID untuk akun ke-${i+1}`);
                    continue;
                }
                tokenId = tokenIds[i];
                console.log(`Token ID dari file: ${tokenId}`);
            }

            console.log(`Mengirim NFT ${tokenId} dari ${wallet.address} ke ${receiver}...`);
            const tx = await utils.sendNFT(nftAddress, wallet, receiver, tokenId);
            await utils.sendWithRetry(wallet, tx);
            console.log(`Berhasil mengirim NFT dari ${wallet.address}`);
        } catch (error) {
            console.error(`Gagal mengirim dari ${wallet.address}:`, error.message);
        }
    }
}

main().catch(console.error);
