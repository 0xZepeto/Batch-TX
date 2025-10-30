/*
 utils.js - helper functions
*/
const fs = require('fs-extra');
const path = require('path');
const { ethers } = require('ethers');

async function readList(filePath) {
  if (!await fs.pathExists(filePath)) return [];
  const raw = await fs.readFile(filePath, 'utf8');
  return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// convert decimal string to BigInt of wei using ethers (supports token decimals)
function parseTokenAmount(amountStr, decimals = 18) {
  try {
    return ethers.parseUnits(amountStr, decimals);
  } catch (e) {
    throw new Error('Invalid amount string: ' + amountStr);
  }
}

// For native: compute amount to send when user wants "all" (balance minus gas)
async function computeMaxSendAmount(provider, wallet, estimateTx) {
  const balance = await provider.getBalance(wallet.address);
  const estimatedGas = await provider.estimateGas(estimateTx);
  const feeData = await provider.getFeeData();
  let gasCost;
  if (feeData.maxFeePerGas && feeData.maxFeePerGas > 0n) {
    const maxFee = feeData.maxFeePerGas;
    gasCost = maxFee * estimatedGas;
  } else {
    const gasPrice = feeData.gasPrice || await provider.getGasPrice();
    gasCost = gasPrice * estimatedGas;
  }
  if (balance <= gasCost) return 0n;
  return balance - gasCost;
}

module.exports = {
  readList, sleep, parseTokenAmount, computeMaxSendAmount
};
