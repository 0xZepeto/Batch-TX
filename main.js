#!/usr/bin/env node
/**
 * main.js
 * Multi-chain native + ERC20/BEP20 sender
 * - pilih network dari rpc.json
 * - pilih fitur: KIRIM NATIVE / KIRIM ERC20/BEP20 / KIRIM SEMUA SALDO KE 1 ADDRESS / DARI MANY PK -> 1 RECEIVED
 * - opsi split many addresses (address.txt)
 * - concurrency + retry
 *
 * Dependencies: ethers@6.15, enquirer, p-limit, fs-extra
 */

const fs = require('fs-extra');
const path = require('path');
const { ethers } = require('ethers');
const { Select, Input, NumberPrompt, Toggle } = require('enquirer');
const pLimit = require('p-limit');
const { readList, parseTokenAmount, computeMaxSendAmount } = require('./utils');

const RPC_FILE = path.join(__dirname, 'rpc.json');
const PK_FILE = path.join(__dirname, 'privatekeys.txt'); // many private keys
const ADDRESS_FILE = path.join(__dirname, 'address.txt'); // many addresses (one per line)
const RECEIVED_FILE = path.join(__dirname, 'received.txt'); // single receiver for many->one
const OUTPUT_LOG = path.join(__dirname, 'send_results.csv');

async function loadRpc() {
  const raw = await fs.readFile(RPC_FILE, 'utf8');
  const json = JSON.parse(raw);
  return json.networks || [];
}

function makeProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

async function promptNetwork(networks) {
  const choices = networks.map(n => ({ name: n.key, message: `${n.name} (${n.chainId})` }));
  const prompt = new Select({
    name: 'network',
    message: 'Pilih jaringan:',
    choices
  });
  const key = await prompt.run();
  return networks.find(n => n.key === key);
}

async function promptMainMenu() {
  const prompt = new Select({
    name: 'menu',
    message: 'Pilih aksi:',
    choices: [
      { name: 'native', message: 'KIRIM NATIVE TOKEN' },
      { name: 'erc20', message: 'KIRIM ERC20/BEP20 TOKEN' },
      { name: 'alltoone', message: 'KIRIM SEMUA SALDO (MANY -> 1 RECEIVED)' },
      { name: 'sendfromone', message: 'DARI 1 ADDRESS -> BANYAK ADDRESS (split)' },
      { name: 'exit', message: 'Keluar' }
    ]
  });
  return await prompt.run();
}

async function loadWalletFromPk(pk, provider) {
  try {
    return new ethers.Wallet(pk, provider);
  } catch (e) {
    throw new Error('Invalid private key');
  }
}

// --- Native send single (from single PK) to many addresses (split)
async function sendNativeFromOneToMany(provider, pk, targets, amountPerTargetWei, concurrency, retries) {
  const wallet = await loadWalletFromPk(pk, provider);
  const limit = pLimit(concurrency);
  const results = [];
  await Promise.all(targets.map((to, idx) => limit(async () => {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const tx = await wallet.sendTransaction({ to, value: amountPerTargetWei });
        await tx.wait();
        results.push({ to, txHash: tx.hash, success: true });
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          results.push({ to, error: err.message || String(err), success: false });
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  })));
  return results;
}

// --- Native send many PK -> 1 received (send all balances)
async function sendNativeManyToOne(provider, pks, received, concurrency, retries) {
  const limit = pLimit(concurrency);
  const results = [];
  await Promise.all(pks.map(pk => limit(async () => {
    const wallet = await loadWalletFromPk(pk, provider);
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const balance = await provider.getBalance(wallet.address);
        if (balance === 0n) {
          results.push({ from: wallet.address, note: 'balance 0', success: false });
          break;
        }
        // construct a tx to estimate gas
        const estimateTx = { to: received, from: wallet.address, value: 1n }; // placeholder
        const maxSend = await computeMaxSendAmount(provider, wallet, estimateTx);
        if (maxSend <= 0n) {
          results.push({ from: wallet.address, note: 'insufficient for gas', success: false });
          break;
        }
        const tx = await wallet.sendTransaction({ to: received, value: maxSend });
        await tx.wait();
        results.push({ from: wallet.address, txHash: tx.hash, success: true });
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          results.push({ from: wallet ? wallet.address : 'unknown', error: err.message || String(err), success: false });
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  })));
  return results;
}

// --- ERC20 send (single sender -> many receivers)
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
];

async function sendERC20FromOneToMany(provider, pk, contractAddress, targets, amountPerTargetHuman, concurrency, retries) {
  const wallet = await loadWalletFromPk(pk, provider);
  const token = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
  const decimals = Number(await token.decimals().catch(()=>18));
  const amountWei = parseTokenAmount(amountPerTargetHuman, decimals);
  const limit = pLimit(concurrency);
  const results = [];
  await Promise.all(targets.map(to => limit(async () => {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const tx = await token.transfer(to, amountWei);
        await tx.wait();
        results.push({ to, txHash: tx.hash, success: true });
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          results.push({ to, error: err.message || String(err), success: false });
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  })));
  return results;
}

// --- ERC20 many PK -> 1 received (send all token balance)
async function sendERC20ManyToOne(provider, pks, contractAddress, received, concurrency, retries) {
  const limit = pLimit(concurrency);
  const results = [];
  for (const pk of pks) {
    // queue
  }
  await Promise.all(pks.map(pk => limit(async () => {
    const wallet = await loadWalletFromPk(pk, provider);
    const token = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const bal = await token.balanceOf(wallet.address);
        if (bal === 0n) {
          results.push({ from: wallet.address, note: 'token balance 0', success: false });
          break;
        }
        const tx = await token.transfer(received, bal);
        await tx.wait();
        results.push({ from: wallet.address, txHash: tx.hash, success: true });
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          results.push({ from: wallet.address, error: err.message || String(err), success: false });
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  })));
  return results;
}

// --- helpers: write CSV results
async function appendCsv(rows) {
  const header = "type,from,to,txHash,success,message\n";
  const exists = await fs.pathExists(OUTPUT_LOG);
  const lines = rows.map(r => {
    return `${r.type||''},${r.from||''},${r.to||''},${r.txHash||''},${r.success===true?'OK':'FAIL'},${(r.error||r.note||'').replace(/[\r\n,]/g,' ')}`;
  }).join('\n')+'\n';
  if (!exists) {
    await fs.writeFile(OUTPUT_LOG, header+lines, 'utf8');
  } else {
    await fs.appendFile(OUTPUT_LOG, lines, 'utf8');
  }
}

async function run() {
  console.log('--- MultiChain Sender ---');
  const networks = await loadRpc();
  const net = await promptNetwork(networks);
  const provider = makeProvider(net.rpc);
  const menu = await promptMainMenu();

  if (menu === 'exit') { console.log('Keluar.'); process.exit(0); }

  if (menu === 'native') {
    // choose from: single pk then send to many addresses OR send many -> one
    const modePrompt = new Select({ name:'mode', message:'Pilih mode native:', choices:[
      {name:'one2many', message:'1 privatekey -> banyak address (split)'},
      {name:'many2one', message:'Banyak privatekey -> 1 received (kirim semua saldo)'}
    ]});
    const mode = await modePrompt.run();

    if (mode === 'one2many') {
      const pks = await readList(PK_FILE);
      if (pks.length === 0) { console.log(`File ${PK_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const pk = pks[0]; // default gunakan pk pertama; jika mau multiple-send-per-akun nanti bisa dikustom
      const addrs = await readList(ADDRESS_FILE);
      if (addrs.length === 0) { console.log(`File ${ADDRESS_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const amount = await new Input({ name:'amount', message:'MASUKAN JUMLAH KIRIM (per alamat, dalam unit token, contoh 0.01) atau ketik "ALL" untuk kirim seluruh saldo (tidak disarankan untuk many recipients)'}).run();
      const concurrency = Number(await new NumberPrompt({ name:'c', message:'Concurrency (parallel requests) default 3', initial: 3 }).run());
      const retries = Number(await new NumberPrompt({ name:'r', message:'Retry on failure per tx default 2', initial: 2 }).run());

      if (amount.toUpperCase() === 'ALL') {
        console.log('Untuk opsi ALL ke banyak alamat tidak didukung (perlu menghitung pembagian). Gunakan custom split via opsi "sendfromone" di menu.');
        process.exit(1);
      } else {
        // parse decimal -> wei
        const amountWei = ethers.parseUnits(amount, 18); // native uses 18
        const results = await sendNativeFromOneToMany(provider, pk, addrs, amountWei, concurrency, retries);
        await appendCsv(results.map(r => ({ type:'native_one2many', from: (new ethers.Wallet(pks[0])).address, to:r.to, txHash:r.txHash, success:r.success, error:r.error||r.note })));
        console.log('Selesai. Lihat send_results.csv untuk detail.');
      }

    } else { // many2one
      const pks = await readList(PK_FILE);
      if (pks.length === 0) { console.log(`File ${PK_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const receivedList = await readList(RECEIVED_FILE);
      if (receivedList.length === 0) { console.log(`File ${RECEIVED_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const received = receivedList[0];
      const concurrency = Number(await new NumberPrompt({ name:'c', message:'Concurrency (parallel) default 3', initial: 3 }).run());
      const retries = Number(await new NumberPrompt({ name:'r', message:'Retry on failure per tx default 2', initial: 2 }).run());

      const results = await sendNativeManyToOne(provider, pks, received, concurrency, retries);
      await appendCsv(results.map(r => ({ type:'native_many2one', from:r.from, to:received, txHash:r.txHash, success:r.success, error:r.error||r.note })));
      console.log('Selesai. Lihat send_results.csv untuk detail.');
    }
  } else if (menu === 'erc20') {
    // ask SC contract
    const sc = await new Input({ name:'sc', message: 'MASUKAN SC TOKEN (address ERC20/BEP20):' }).run();
    const modePrompt = new Select({ name:'mode', message:'Pilih mode:', choices:[
      {name:'one2many', message:'1 privatekey -> banyak address (kirim per jumlah)'},
      {name:'many2one', message:'Banyak privatekey -> 1 received (kirim semua token)'}
    ]});
    const mode = await modePrompt.run();

    if (mode === 'one2many') {
      const pks = await readList(PK_FILE);
      if (pks.length === 0) { console.log(`File ${PK_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const pk = pks[0];
      const addrs = await readList(ADDRESS_FILE);
      if (addrs.length === 0) { console.log(`File ${ADDRESS_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const amount = await new Input({ name:'amount', message:'MASUKAN JUMLAH TOKEN (per address, human readable):' }).run();
      const concurrency = Number(await new NumberPrompt({ name:'c', message:'Concurrency default 4', initial: 4 }).run());
      const retries = Number(await new NumberPrompt({ name:'r', message:'Retry on failure default 2', initial: 2 }).run());

      const res = await sendERC20FromOneToMany(provider, pk, sc, addrs, amount, concurrency, retries);
      await appendCsv(res.map(r => ({ type:'erc20_one2many', from:(new ethers.Wallet(pks[0])).address, to:r.to, txHash:r.txHash, success:r.success, error:r.error||r.note })));
      console.log('Selesai. Lihat send_results.csv');
    } else {
      const pks = await readList(PK_FILE);
      if (pks.length === 0) { console.log(`File ${PK_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const receivedList = await readList(RECEIVED_FILE);
      if (receivedList.length === 0) { console.log(`File ${RECEIVED_FILE} kosong atau tidak ditemukan.`); process.exit(1); }
      const received = receivedList[0];
      const concurrency = Number(await new NumberPrompt({ name:'c', message:'Concurrency default 4', initial: 4 }).run());
      const retries = Number(await new NumberPrompt({ name:'r', message:'Retry on failure default 2', initial: 2 }).run());
      const res = await sendERC20ManyToOne(provider, pks, sc, received, concurrency, retries);
      await appendCsv(res.map(r => ({ type:'erc20_many2one', from:r.from, to:received, txHash:r.txHash, success:r.success, error:r.error||r.note })));
      console.log('Selesai. Lihat send_results.csv');
    }

  } else if (menu === 'sendfromone') {
    // custom split: one privatekey -> many addresses (equal or custom)
    const pks = await readList(PK_FILE);
    if (pks.length === 0) { console.log('privatekeys.txt kosong.'); process.exit(1); }
    const pk = pks[0];
    const addrs = await readList(ADDRESS_FILE);
    if (addrs.length === 0) { console.log('address.txt kosong.'); process.exit(1); }

    const splitMode = await new Select({ name:'split', message:'Pilih split:', choices:[
      {name:'equal', message:'Equal split (rata-rata)'},
      {name:'custom', message:'Custom split (masukkan komposisi)'}
    ]}).run();

    let ratios = null;
    if (splitMode === 'equal') {
      ratios = addrs.map(()=>1);
    } else {
      const input = await new Input({ name:'cus', message:`Masukkan rasio/proporsi untuk ${addrs.length} alamat, pisahkan koma (mis 1,2,1 untuk 3 alamat):` }).run();
      ratios = input.split(',').map(s=>Number(s.trim())).map(v=>isNaN(v)?0:v);
      if (ratios.length !== addrs.length) {
        console.log('Jumlah rasio harus sama dengan jumlah alamat. Keluar.');
        process.exit(1);
      }
    }

    // ask amount total to split (in human readable)
    const amount = await new Input({ name:'amount', message:'MASUKAN JUMLAH TOTAL (untuk dibagi ke banyak address), dalam unit token/native (contoh 1.5):' }).run();
    const isNative = await new Toggle({ name:'isnative', message:'Apakah ini native token? (on=yes)' , enabled:'YES', disabled:'NO' }).run();
    const concurrency = Number(await new NumberPrompt({ name:'c', message:'Concurrency default 3', initial:3 }).run());
    const retries = Number(await new NumberPrompt({ name:'r', message:'Retry default 2', initial:2 }).run());

    const totalRatio = ratios.reduce((a,b)=>a+b,0);
    if (isNative) {
      // convert amount to wei
      const totalWei = ethers.parseUnits(amount, 18);
      // allocate per address
      const amountsWei = ratios.map(r => totalWei * BigInt(Math.floor(r*1e6)) / BigInt(Math.floor(totalRatio*1e6))); // avoid fraction issues
      // adjust last to account rounding
      let sum = amountsWei.reduce((a,b)=>a+b, 0n);
      if (sum !== totalWei) {
        amountsWei[amountsWei.length-1] += (totalWei - sum);
      }
      // send using sendNativeFromOneToMany but our function uses same amount for all; let's send manually with concurrency
      const wallet = await loadWalletFromPk(pk, provider);
      const limit = pLimit(concurrency);
      const results = [];
      await Promise.all(addrs.map((to, idx) => limit(async () => {
        let attempt=0;
        while (attempt<=retries) {
          try {
            const tx = await wallet.sendTransaction({ to, value: amountsWei[idx] });
            await tx.wait();
            results.push({ from: wallet.address, to, txHash: tx.hash, success:true });
            break;
          } catch (err) {
            attempt++;
            if (attempt>retries) results.push({ from:wallet.address, to, error:err.message||String(err), success:false });
            else await new Promise(r=>setTimeout(r,1000*attempt));
          }
        }
      })));
      await appendCsv(results.map(r=>({ type:'native_split', from:r.from, to:r.to, txHash:r.txHash, success:r.success, error:r.error||'' })));
      console.log('Selesai. Lihat send_results.csv');

    } else {
      // ERC20: ask SC
      const sc = await new Input({ name:'sc', message:'MASUKAN SC TOKEN ERC20/BEP20:' }).run();
      // get decimals
      const tmp = new ethers.Wallet(pks[0], provider);
      const token = new ethers.Contract(sc, ERC20_ABI, tmp);
      const decimals = Number(await token.decimals().catch(()=>18));
      const totalWei = parseTokenAmount(amount, decimals);
      const amounts = ratios.map(r => totalWei * BigInt(Math.floor(r*1e6)) / BigInt(Math.floor(totalRatio*1e6)));
      let sum = amounts.reduce((a,b)=>a+b, 0n);
      if (sum !== totalWei) {
        amounts[amounts.length-1] += (totalWei - sum);
      }
      const wallet = await loadWalletFromPk(pk, provider);
      const tokenWithSigner = new ethers.Contract(sc, ERC20_ABI, wallet);
      const limit = pLimit(concurrency);
      const results = [];
      await Promise.all(addrs.map((to, idx) => limit(async () => {
        let attempt=0;
        while (attempt<=retries) {
          try {
            const tx = await tokenWithSigner.transfer(to, amounts[idx]);
            await tx.wait();
            results.push({ from: wallet.address, to, txHash: tx.hash, success:true });
            break;
          } catch (err) {
            attempt++;
            if (attempt>retries) results.push({ from:wallet.address, to, error:err.message||String(err), success:false });
            else await new Promise(r=>setTimeout(r,1000*attempt));
          }
        }
      })));
      await appendCsv(results.map(r=>({ type:'erc20_split', from:r.from, to:r.to, txHash:r.txHash, success:r.success, error:r.error||'' })));
      console.log('Selesai. Lihat send_results.csv');
    }

  } else {
    console.log('Menu belum diimplementasi.');
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
