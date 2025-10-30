#!/usr/bin/env node
/**
 * SendNFT.js
 * - pilih network (rpc.json)
 * - input SC NFT (ERC721) address
 * - scan the given PK list (pk.txt) and detect token ids owned by each account for that SC
 * - send those token ids to address in received.txt (single)
 *
 * Strategy:
 * 1. Try tokenOfOwnerByIndex (ERC721Enumerable)
 * 2. If not available, fallback to scanning Transfer events (fastest possible window; configurable)
 *
 * NOTE: Scanning events from block 0 may be slow or rate-limited. Default scan window = last 200000 blocks (configurable).
 */

const fs = require('fs-extra');
const path = require('path');
const { ethers } = require('ethers');
const { Select, Input, NumberPrompt } = require('enquirer');
const pLimit = require('p-limit');
const { readList } = require('./utils');

const RPC_FILE = path.join(__dirname, 'rpc.json');
const PK_FILE = path.join(__dirname, 'pk.txt');
const RECEIVED_FILE = path.join(__dirname, 'received.txt');
const OUTPUT_LOG = path.join(__dirname, 'nft_send_results.csv');

const ERC721_ABI = [
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)"
];

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

async function detectTokenIdsEnumerable(contract, owner) {
  try {
    const bal = await contract.balanceOf(owner);
    const n = Number(bal);
    const ids = [];
    for (let i = 0; i < n; i++) {
      try {
        const id = await contract.tokenOfOwnerByIndex(owner, i);
        ids.push(id.toString());
      } catch (e) {
        // if tokenOfOwnerByIndex not supported, abort
        return null;
      }
    }
    return ids;
  } catch (e) {
    return null;
  }
}

async function detectTokenIdsByEvents(provider, contractAddress, owner, fromBlock, toBlock) {
  // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
  const iface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"]);
  const topic = iface.getEventTopic('Transfer');
  // filter logs where from == owner OR to == owner (we want owned tokens -> use to==owner and check subsequent transfers out)
  // We'll fetch logs where 'to' == owner to get candidate tokenIds
  const topicTo = ethers.TopicFilter.from(owner);
  // Unfortunately ethers v6 provider.getLogs accepts filter object; build properly:
  const filter = {
    address: contractAddress,
    fromBlock,
    toBlock,
    topics: [
      iface.getEventTopic('Transfer'),
      null,
      ethers.TopicFilter.from(owner) // to == owner
    ]
  };
  const logs = await provider.getLogs(filter);
  const tokenIds = new Set();
  for (const l of logs) {
    try {
      const parsed = iface.parseLog(l);
      const tokenId = parsed.args.tokenId.toString();
      tokenIds.add(tokenId);
    } catch (e) { /* ignore */ }
  }
  // We need to filter out tokenIds that may have been transferred out later; best-effort: check ownerOf for each (if contract has ownerOf)
  const erc721iface = new ethers.Interface(["function ownerOf(uint256 tokenId) view returns (address)"]);
  const contractForOwnerOf = new ethers.Contract(contractAddress, ["function ownerOf(uint256) view returns (address)"], provider);
  const final = [];
  for (const id of tokenIds) {
    try {
      const o = await contractForOwnerOf.ownerOf(BigInt(id));
      if (o.toLowerCase() === owner.toLowerCase()) final.push(id);
    } catch (e) {
      // ownerOf might revert for burned tokens, ignore
    }
  }
  return final;
}

async function sendNFTs(provider, pk, contractAddress, tokenIds, received, concurrency, retries) {
  const wallet = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(contractAddress, ERC721_ABI, wallet);
  const limit = pLimit(concurrency);
  const results = [];
  await Promise.all(tokenIds.map(tokenId => limit(async () => {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const tx = await contract.safeTransferFrom(wallet.address, received, BigInt(tokenId));
        await tx.wait();
        results.push({ from: wallet.address, tokenId, txHash: tx.hash, success: true });
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          results.push({ from: wallet.address, tokenId, error: err.message || String(err), success: false });
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  })));
  return results;
}

async function appendCsv(rows) {
  const header = "from,tokenId,txHash,success,message\n";
  const exists = await fs.pathExists(OUTPUT_LOG);
  const lines = rows.map(r => `${r.from||''},${r.tokenId||''},${r.txHash||''},${r.success===true?'OK':'FAIL'},${(r.error||'').replace(/[\r\n,]/g,' ')}`).join('\n')+'\n';
  if (!exists) await fs.writeFile(OUTPUT_LOG, header+lines,'utf8'); else await fs.appendFile(OUTPUT_LOG, lines,'utf8');
}

async function run() {
  console.log('--- SendNFT ---');
  const networks = await loadRpc();
  const net = await promptNetwork(networks);
  const provider = makeProvider(net.rpc);

  const sc = await new Input({ name:'sc', message:'MASUKAN SC NFT (ERC721) address:' }).run();
  const pks = await readList(PK_FILE);
  if (pks.length === 0) { console.log('pk.txt kosong.'); process.exit(1); }
  const receivedList = await readList(RECEIVED_FILE);
  if (receivedList.length === 0) { console.log('received.txt kosong.'); process.exit(1); }
  const received = receivedList[0];
  const blocksWindow = Number(await new NumberPrompt({ name:'bw', message:'Block scan window (berapa block ke belakang) default 200000', initial: 200000 }).run());
  const concurrency = Number(await new NumberPrompt({ name:'c', message:'Concurrency untuk transfer default 6', initial: 6 }).run());
  const retries = Number(await new NumberPrompt({ name:'r', message:'Retry default 2', initial: 2 }).run());

  const contract = new ethers.Contract(sc, ERC721_ABI, provider);

  // loop through pk list, detect token IDs and send
  for (const pk of pks) {
    const wallet = new ethers.Wallet(pk, provider);
    const owner = wallet.address;
    console.log(`Memproses wallet ${owner} ...`);
    // 1) try enumerable
    let ids = await detectTokenIdsEnumerable(contract, owner);
    if (ids && ids.length > 0) {
      console.log(`Detected ${ids.length} token(s) via enumerable for ${owner}`);
    } else {
      // fallback: scan events
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - blocksWindow);
      console.log(`FALLBACK: scanning Transfer logs from block ${fromBlock}..${latest} (may be slow) for ${owner}`);
      try {
        ids = await detectTokenIdsByEvents(provider, sc, owner, fromBlock, latest);
      } catch (e) {
        console.error('Error scanning logs:', e.message || e);
        ids = [];
      }
      console.log(`Detected ${ids.length} token(s) via events for ${owner}`);
    }
    if (!ids || ids.length === 0) {
      console.log(`Tidak ditemukan NFT untuk ${owner}`);
      continue;
    }
    // send them to received
    const res = await sendNFTs(provider, pk, sc, ids, received, concurrency, retries);
    await appendCsv(res);
    console.log(`Selesai wallet ${owner}`);
  }

  console.log('Selesai semua. Cek nft_send_results.csv untuk detail.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
  
