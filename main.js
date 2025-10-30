const ethers = require('ethers');
const readline = require('readline');
const fs = require('fs');
const {
    getNetworks,
    getProvider,
    getWallet,
    sendNativeTransaction,
    sendTokenTransaction,
    getTokenDecimals,
    startSpinner,
    stopSpinner
} = require('./utils');

// Create readline interface for keypress handling
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to handle menu selection with arrow keys
function showMenu(options, message) {
    return new Promise((resolve) => {
        let selectedIndex = 0;
        
        // Display initial menu
        displayMenu();
        
        // Handle keypress events
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on('keypress', (str, key) => {
            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + options.length) % options.length;
                displayMenu();
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % options.length;
                displayMenu();
            } else if (key.name === 'return') {
                process.stdin.setRawMode(false);
                process.stdin.removeAllListeners('keypress');
                resolve(selectedIndex);
            } else if (key.name === 'escape') {
                process.exit();
            }
        });
        
        function displayMenu() {
            console.clear();
            console.log(message);
            options.forEach((option, index) => {
                if (index === selectedIndex) {
                    console.log(`> ${option}`);
                } else {
                    console.log(`  ${option}`);
                }
            });
            console.log('\nUse arrow keys to navigate, Enter to select, Esc to exit');
        }
    });
}

async function main() {
    console.clear();
    console.log('=== BATCH TRANSACTION SENDER ===\n');

    // Load networks
    const networks = getNetworks();
    if (networks.length === 0) {
        console.log('No networks found in rpc.json');
        return;
    }

    // Network selection with arrow keys
    const networkOptions = networks.map(net => `${net.name} (${net.symbol || 'ETH'})`);
    const networkChoice = await showMenu(networkOptions, 'Select Network:');
    const selectedNetwork = networks[networkChoice];
    const provider = getProvider(selectedNetwork.rpcUrl);

    // Load private keys
    const privateKeys = fs.readFileSync('privatekey.txt', 'utf8')
        .split('\n')
        .filter(key => key.trim() !== '');
    const wallets = privateKeys.map(pk => getWallet(pk, provider));

    // Transaction type selection with arrow keys
    const txTypeChoice = await showMenu(
        ['Send Native Token', 'Send ERC20/BEP20 Token'], 
        'Select Transaction Type:'
    );

    if (txTypeChoice === 0) {
        await handleNativeTransaction(selectedNetwork, wallets, provider);
    } else if (txTypeChoice === 1) {
        await handleTokenTransaction(selectedNetwork, wallets, provider);
    }
    
    rl.close();
}

async function handleNativeTransaction(network, wallets, provider) {
    console.clear();
    console.log(`Send ${network.symbol || 'ETH'} (Native Token)\n`);
    
    const totalAmount = parseFloat(await question('Enter total amount to send: '));
    
    const modeChoice = await showMenu(
        [
            'From 1 address to many addresses (address.txt)',
            'From many addresses (privatekey.txt) to 1 address'
        ],
        'Send Mode:'
    );

    if (modeChoice === 0) {
        await oneToManyNative(network, wallets, provider, totalAmount);
    } else if (modeChoice === 1) {
        await manyToOneNative(network, wallets, provider, totalAmount);
    }
}

async function handleTokenTransaction(network, wallets, provider) {
    console.clear();
    console.log('Send ERC20/BEP20 Token\n');
    
    const tokenAddress = await question('Enter token contract address: ');
    const totalAmount = parseFloat(await question('Enter total amount to send: '));
    
    // Show spinner while fetching token decimals
    const spinner = startSpinner('Fetching token info');
    const decimals = await getTokenDecimals(tokenAddress, provider);
    stopSpinner(spinner);
    
    const modeChoice = await showMenu(
        [
            'From 1 address to many addresses (address.txt)',
            'From many addresses (privatekey.txt) to 1 address'
        ],
        'Send Mode:'
    );

    if (modeChoice === 0) {
        await oneToManyToken(network, wallets, provider, tokenAddress, totalAmount, decimals);
    } else if (modeChoice === 1) {
        await manyToOneToken(network, wallets, provider, tokenAddress, totalAmount, decimals);
    }
}

// Helper function for questions
function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function oneToManyNative(network, wallets, provider, totalAmount) {
    const addresses = fs.readFileSync('address.txt', 'utf8')
        .split('\n')
        .filter(addr => addr.trim() !== '');

    console.clear();
    console.log('Select Sender Wallet:\n');
    const walletOptions = wallets.map((wallet, i) => `${i + 1}. ${wallet.address}`);
    const senderIndex = await showMenu(walletOptions, 'Select Sender Wallet:');
    const senderWallet = wallets[senderIndex];

    const splitChoice = await showMenu(
        ['Equal split', 'Custom split'],
        'Split Option:'
    );

    let amounts;
    if (splitChoice === 0) {
        const amountPerAddress = totalAmount / addresses.length;
        amounts = addresses.map(() => amountPerAddress);
    } else {
        console.clear();
        console.log('Enter amounts separated by commas:');
        const input = await question('> ');
        const inputAmounts = input.split(',').map(n => parseFloat(n.trim()));
        if (inputAmounts.length !== addresses.length) {
            console.log('Amount count must match address count');
            return;
        }
        amounts = inputAmounts;
    }

    const concurrency = parseInt(await question('Enter concurrency level (default 5): ')) || 5;
    const retry = await question('Enable retry on failure? (y/n): ').toLowerCase() === 'y';

    console.clear();
    console.log('Sending transactions...\n');
    const spinner = startSpinner('Processing');
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
    
    stopSpinner(spinner);
    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${addresses[i]}: ${hash}`);
    });
}

async function manyToOneNative(network, wallets, provider, totalAmount) {
    const recipient = await question('Enter recipient address: ');
    
    const splitChoice = await showMenu(
        ['Equal split', 'Custom split'],
        'Split Option:'
    );

    let amounts;
    if (splitChoice === 0) {
        const amountPerWallet = totalAmount / wallets.length;
        amounts = wallets.map(() => amountPerWallet);
    } else {
        console.clear();
        console.log('Enter amounts separated by commas:');
        const input = await question('> ');
        const inputAmounts = input.split(',').map(n => parseFloat(n.trim()));
        if (inputAmounts.length !== wallets.length) {
            console.log('Amount count must match wallet count');
            return;
        }
        amounts = inputAmounts;
    }

    const concurrency = parseInt(await question('Enter concurrency level (default 5): ')) || 5;
    const retry = await question('Enable retry on failure? (y/n): ').toLowerCase() === 'y';

    console.clear();
    console.log('Sending transactions...\n');
    const spinner = startSpinner('Processing');
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
    
    stopSpinner(spinner);
    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${wallets[i].address}: ${hash}`);
    });
}

async function oneToManyToken(network, wallets, provider, tokenAddress, totalAmount, decimals) {
    const addresses = fs.readFileSync('address.txt', 'utf8')
        .split('\n')
        .filter(addr => addr.trim() !== '');

    console.clear();
    console.log('Select Sender Wallet:\n');
    const walletOptions = wallets.map((wallet, i) => `${i + 1}. ${wallet.address}`);
    const senderIndex = await showMenu(walletOptions, 'Select Sender Wallet:');
    const senderWallet = wallets[senderIndex];

    const splitChoice = await showMenu(
        ['Equal split', 'Custom split'],
        'Split Option:'
    );

    let amounts;
    if (splitChoice === 0) {
        const amountPerAddress = totalAmount / addresses.length;
        amounts = addresses.map(() => amountPerAddress);
    } else {
        console.clear();
        console.log('Enter amounts separated by commas:');
        const input = await question('> ');
        const inputAmounts = input.split(',').map(n => parseFloat(n.trim()));
        if (inputAmounts.length !== addresses.length) {
            console.log('Amount count must match address count');
            return;
        }
        amounts = inputAmounts;
    }

    const concurrency = parseInt(await question('Enter concurrency level (default 5): ')) || 5;
    const retry = await question('Enable retry on failure? (y/n): ').toLowerCase() === 'y';

    console.clear();
    console.log('Sending transactions...\n');
    const spinner = startSpinner('Processing');
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
    
    stopSpinner(spinner);
    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${addresses[i]}: ${hash}`);
    });
}

async function manyToOneToken(network, wallets, provider, tokenAddress, totalAmount, decimals) {
    const recipient = await question('Enter recipient address: ');
    
    const splitChoice = await showMenu(
        ['Equal split', 'Custom split'],
        'Split Option:'
    );

    let amounts;
    if (splitChoice === 0) {
        const amountPerWallet = totalAmount / wallets.length;
        amounts = wallets.map(() => amountPerWallet);
    } else {
        console.clear();
        console.log('Enter amounts separated by commas:');
        const input = await question('> ');
        const inputAmounts = input.split(',').map(n => parseFloat(n.trim()));
        if (inputAmounts.length !== wallets.length) {
            console.log('Amount count must match wallet count');
            return;
        }
        amounts = inputAmounts;
    }

    const concurrency = parseInt(await question('Enter concurrency level (default 5): ')) || 5;
    const retry = await question('Enable retry on failure? (y/n): ').toLowerCase() === 'y';

    console.clear();
    console.log('Sending transactions...\n');
    const spinner = startSpinner('Processing');
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
    
    stopSpinner(spinner);
    console.log('\nTransaction Results:');
    results.forEach((hash, i) => {
        console.log(`${i + 1}. ${wallets[i].address}: ${hash}`);
    });
}

main().catch(console.error);
