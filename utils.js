const fs = require('fs');
const ethers = require('ethers');

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
}

function selectNetwork() {
    const rpcConfig = JSON.parse(fs.readFileSync('rpc.json', 'utf8'));
    const networks = rpcConfig.networks;

    console.log('Pilih jaringan:');
    networks.forEach((net, index) => {
        console.log(`${index + 1}. ${net.name} (Chain ID: ${net.chainId})`);
    });

    const readline = require('readline-sync');
    const choice = readline.question('Masukkan nomor jaringan: ');
    const index = parseInt(choice) - 1;

    if (index >= 0 && index < networks.length) {
        return networks[index];
    } else {
        console.log('Pilihan tidak valid.');
        process.exit(1);
    }
}

function createWallet(privateKey, rpcUrl) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return new ethers.Wallet(privateKey, provider);
}

async function sendWithRetry(wallet, tx, maxRetries = 3) {
    let retryCount = 0;
    while (retryCount < maxRetries) {
        try {
            const txResponse = await wallet.sendTransaction(tx);
            console.log(`Transaction sent: ${txResponse.hash}`);
            return await txResponse.wait();
        } catch (error) {
            retryCount++;
            console.error(`Attempt ${retryCount} failed:`, error.message);
            if (retryCount >= maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function getNativeBalance(wallet) {
    const balance = await wallet.provider.getBalance(wallet.address);
    return ethers.formatEther(balance);
}

async function getTokenBalance(wallet, tokenContract) {
    const balance = await tokenContract.balanceOf(wallet.address);
    return balance;
}

function createTokenContract(tokenAddress, wallet) {
    const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function decimals() view returns (uint8)"
    ];
    return new ethers.Contract(tokenAddress, abi, wallet);
}

async function sendToken(tokenContract, toAddress, amount, decimals) {
    const amountInWei = ethers.parseUnits(amount, decimals);
    return await tokenContract.transfer(toAddress, amountInWei);
}

async function sendNative(wallet, toAddress, amount) {
    const amountInWei = ethers.parseEther(amount);
    const tx = { to: toAddress, value: amountInWei };
    return await wallet.sendTransaction(tx);
}

async function getNFTTokenIds(nftContract, ownerAddress) {
    const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
    ];
    const contract = new ethers.Contract(nftContract, abi, nftContract.runner);
    const balance = await contract.balanceOf(ownerAddress);
    const tokenIds = [];
    for (let i = 0; i < balance; i++) {
        const tokenId = await contract.tokenOfOwnerByIndex(ownerAddress, i);
        tokenIds.push(tokenId.toString());
    }
    return tokenIds;
}

async function sendNFT(nftContract, fromWallet, toAddress, tokenId) {
    const abi = ["function transferFrom(address from, address to, uint256 tokenId)"];
    const contract = new ethers.Contract(nftContract, abi, fromWallet);
    return await contract.transferFrom(fromWallet.address, toAddress, tokenId);
}

module.exports = {
    readFile,
    selectNetwork,
    createWallet,
    sendWithRetry,
    getNativeBalance,
    getTokenBalance,
    createTokenContract,
    sendToken,
    sendNative,
    getNFTTokenIds,
    sendNFT
};
