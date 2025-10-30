const ethers = require('ethers');
const fs = require('fs');

function getNetworks() {
    try {
        const data = fs.readFileSync('rpc.json', 'utf8');
        return JSON.parse(data).networks;
    } catch (error) {
        console.error("Error reading rpc.json:", error);
        return [];
    }
}

function getProvider(rpcUrl) {
    return new ethers.JsonRpcProvider(rpcUrl);
}

function getWallet(privateKey, provider) {
    return new ethers.Wallet(privateKey, provider);
}

async function sendNativeTransaction(wallet, to, amount, provider, retry = false) {
    try {
        const tx = {
            to: to,
            value: ethers.parseEther(amount.toString())
        };
        const txResponse = await wallet.sendTransaction(tx);
        await txResponse.wait();
        return txResponse.hash;
    } catch (error) {
        if (retry) {
            console.log(`Retrying transaction... Error: ${error.message}`);
            return sendNativeTransaction(wallet, to, amount, provider, false);
        }
        throw error;
    }
}

async function sendTokenTransaction(wallet, tokenAddress, to, amount, decimals, provider, retry = false) {
    try {
        const contract = new ethers.Contract(tokenAddress, [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function decimals() view returns (uint8)"
        ], wallet);
        
        const tokenAmount = ethers.parseUnits(amount.toString(), decimals);
        const tx = await contract.transfer(to, tokenAmount);
        await tx.wait();
        return tx.hash;
    } catch (error) {
        if (retry) {
            console.log(`Retrying token transaction... Error: ${error.message}`);
            return sendTokenTransaction(wallet, tokenAddress, to, amount, decimals, provider, false);
        }
        throw error;
    }
}

async function getTokenDecimals(tokenAddress, provider) {
    const contract = new ethers.Contract(tokenAddress, [
        "function decimals() view returns (uint8)"
    ], provider);
    return await contract.decimals();
}

module.exports = {
    getNetworks,
    getProvider,
    getWallet,
    sendNativeTransaction,
    sendTokenTransaction,
    getTokenDecimals
};
