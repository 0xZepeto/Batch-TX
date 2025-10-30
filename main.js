const ethers = require('ethers');
const readline = require('readline-sync');
const fs = require('fs');
const {
    getNetworks,
    getProvider,
    getWallet,
    sendNativeTransaction,
    sendTokenTransaction,
    getTokenDecimals
} = require('./utils');

async function main() {
    console.log('=== BATCH TRANSACTION SENDER ===\n');

    // Load networks
    const networks = getNetworks();
    if (networks.length === 0) {
        console.log('No networks found in rpc.json');
        return;
    }

    // Network selection
    console.log('Select Network:');
    networks.forEach((net, i) => {
        console.log(`${i + 1}. ${net.name} (${net.symbol})`);
    });
    const networkChoice = readline.questionInt('Enter network number: ') - 1;
    const selectedNetwork = networks[networkChoice];
    const provider = getProvider(selectedNetwork.rpcUrl);

    // Load private keys
    const privateKeys = fs.readFileSync('privatekey.txt', 'utf8')
        .split('\n')
        .filter(key => key.trim() !== '');
    const wallets = privateKeys.map(pk => getWallet(pk, provider));

    // Transaction type selection
    console.log('\nSelect Transaction Type:');
    console.log('1. Send Native Token');
    console.log('2. Send ERC20/BEP20 Token');
    const txType = readline.questionInt('Enter choice: ');

    if (txType === 1) {
        await handleNativeTransaction(selectedNetwork, wallets, provider);
    } else if (txType === 2) {
        await handleTokenTransaction(selectedNetwork, wallets, provider);
    } else {
        console.log('Invalid choice');
    }
}

async function handleNativeTransaction(network, wallets, provider) {
    console.log(`\nSend ${network.symbol} (Native Token)`);
    const totalAmount = readline.questionFloat('Enter total amount to send: ');

    console.log('\nSend Mode:');
    console.log('1. From 1 address to many addresses (address.txt)');
    console.log('2. From many addresses (privatekey.txt) to 1 address');
    const mode = readline.questionInt('Enter mode: ');

    if (mode === 1) {
        await oneToManyNative(network, wallets, provider, totalAmount);
    } else if (mode === 2) {
        await manyToOneNative(network, wallets, provider, totalAmount);
    } else {
        console.log('Invalid mode');
    }
}

async function handleTokenTransaction(network, wallets, provider) {
    console.log('\nSend ERC20/BEP20 Token');
    const tokenAddress = readline.question('Enter token contract address: ');
    const totalAmount = readline.questionFloat('Enter total amount to send: ');
    const decimals = await getTokenDecimals(tokenAddress, provider);

    console.log('\nSend Mode:');
    console.log('1. From 1 address to many addresses (address.txt)');
    console.log('2. From many addresses (privatekey.txt) to 1 address');
    const mode = readline.questionInt('Enter mode: ');

    if (mode === 1) {
        await oneToManyToken(network, wallets, provider, tokenAddress, totalAmount, decimals);
    } else if (mode === 2) {
        await manyToOneToken(network, wallets, provider, tokenAddress, totalAmount, decimals);
    } else {
        console.log('Invalid mode');
    }
}

async function oneToManyNative(network, wallets, provider, totalAmount) {
    const addresses = fs.readFileSync('address.txt', 'utf8')
        .split('\n')
        .filter(addr => addr.trim() !== '');

    console.log('\nSelect Sender Wallet:');
    wallets.forEach((wallet, i) => {
        console.log(`${i + 1}. ${wallet.address}`);
    });
    const senderIndex = readline.questionInt('Enter wallet number: ') - 1;
    const senderWallet = wallets[senderIndex];

    console.log('\nSplit Option:');
    console.log('1. Equal split');
    console.log('2. Custom split');
    const splitOption = readline.questionInt('Enter option: ');

    let amounts;
    if (splitOption === 1) {
        const amountPerAddress = totalAmount / addresses.length;
        amounts = addresses.map(() => amountPerAddress);
    } else {
        console.log('Enter amounts separated by commas:');
        const input = readline.question().split(',').map(n => parseFloat(n.trim()));
        if (input.length !== addresses.length) {
            console.log('Amount count must match address count');
            return;
        }
        amounts = input;
    }

    const concurrency = readline.questionInt('Enter concurrency level (default 5): ') || 5;
    const retry = readline.keyInYN('Enable retry on failure?');

    console.log('\nSending transactions...');
    const results = [];
    for (let i = 0; i < addresses.length; i += concurrency) {
        const batch = addresses.slice(i, i + concurrency);
        const batchAmounts = amounts.slice(i, i + concurrency);
        const promises = batch.map((addr, j) => 
            sendNativeTransaction(senderWallet, addr, batchAmounts[j], provider, retry)
                .catch(e => `Failed: ${e.message}`)
        );
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
    }

    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${addresses[i]}: ${hash}`);
    });
}

async function manyToOneNative(network, wallets, provider, totalAmount) {
    const recipient = readline.question('Enter recipient address: ');
    
    console.log('\nSplit Option:');
    console.log('1. Equal split');
    console.log('2. Custom split');
    const splitOption = readline.questionInt('Enter option: ');

    let amounts;
    if (splitOption === 1) {
        const amountPerWallet = totalAmount / wallets.length;
        amounts = wallets.map(() => amountPerWallet);
    } else {
        console.log('Enter amounts separated by commas:');
        const input = readline.question().split(',').map(n => parseFloat(n.trim()));
        if (input.length !== wallets.length) {
            console.log('Amount count must match wallet count');
            return;
        }
        amounts = input;
    }

    const concurrency = readline.questionInt('Enter concurrency level (default 5): ') || 5;
    const retry = readline.keyInYN('Enable retry on failure?');

    console.log('\nSending transactions...');
    const results = [];
    for (let i = 0; i < wallets.length; i += concurrency) {
        const batch = wallets.slice(i, i + concurrency);
        const batchAmounts = amounts.slice(i, i + concurrency);
        const promises = batch.map((wallet, j) => 
            sendNativeTransaction(wallet, recipient, batchAmounts[j], provider, retry)
                .catch(e => `Failed: ${e.message}`)
        );
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
    }

    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${wallets[i].address}: ${hash}`);
    });
}

async function oneToManyToken(network, wallets, provider, tokenAddress, totalAmount, decimals) {
    const addresses = fs.readFileSync('address.txt', 'utf8')
        .split('\n')
        .filter(addr => addr.trim() !== '');

    console.log('\nSelect Sender Wallet:');
    wallets.forEach((wallet, i) => {
        console.log(`${i + 1}. ${wallet.address}`);
    });
    const senderIndex = readline.questionInt('Enter wallet number: ') - 1;
    const senderWallet = wallets[senderIndex];

    console.log('\nSplit Option:');
    console.log('1. Equal split');
    console.log('2. Custom split');
    const splitOption = readline.questionInt('Enter option: ');

    let amounts;
    if (splitOption === 1) {
        const amountPerAddress = totalAmount / addresses.length;
        amounts = addresses.map(() => amountPerAddress);
    } else {
        console.log('Enter amounts separated by commas:');
        const input = readline.question().split(',').map(n => parseFloat(n.trim()));
        if (input.length !== addresses.length) {
            console.log('Amount count must match address count');
            return;
        }
        amounts = input;
    }

    const concurrency = readline.questionInt('Enter concurrency level (default 5): ') || 5;
    const retry = readline.keyInYN('Enable retry on failure?');

    console.log('\nSending transactions...');
    const results = [];
    for (let i = 0; i < addresses.length; i += concurrency) {
        const batch = addresses.slice(i, i + concurrency);
        const batchAmounts = amounts.slice(i, i + concurrency);
        const promises = batch.map((addr, j) => 
            sendTokenTransaction(senderWallet, tokenAddress, addr, batchAmounts[j], decimals, provider, retry)
                .catch(e => `Failed: ${e.message}`)
        );
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
    }

    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${addresses[i]}: ${hash}`);
    });
}

async function manyToOneToken(network, wallets, provider, tokenAddress, totalAmount, decimals) {
    const recipient = readline.question('Enter recipient address: ');
    
    console.log('\nSplit Option:');
    console.log('1. Equal split');
    console.log('2. Custom split');
    const splitOption = readline.questionInt('Enter option: ');

    let amounts;
    if (splitOption === 1) {
        const amountPerWallet = totalAmount / wallets.length;
        amounts = wallets.map(() => amountPerWallet);
    } else {
        console.log('Enter amounts separated by commas:');
        const input = readline.question().split(',').map(n => parseFloat(n.trim()));
        if (input.length !== wallets.length) {
            console.log('Amount count must match wallet count');
            return;
        }
        amounts = input;
    }

    const concurrency = readline.questionInt('Enter concurrency level (default 5): ') || 5;
    const retry = readline.keyInYN('Enable retry on failure?');

    console.log('\nSending transactions...');
    const results = [];
    for (let i = 0; i < wallets.length; i += concurrency) {
        const batch = wallets.slice(i, i + concurrency);
        const batchAmounts = amounts.slice(i, i + concurrency);
        const promises = batch.map((wallet, j) => 
            sendTokenTransaction(wallet, tokenAddress, recipient, batchAmounts[j], decimals, provider, retry)
                .catch(e => `Failed: ${e.message}`)
        );
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
    }

    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${wallets[i].address}: ${hash}`);
    });
}

main().catch(console.error);
