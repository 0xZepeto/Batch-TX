const fs = require('fs');
const ethers = require('ethers');

// Membaca file
const readFile = (filename) => {
  try {
    return fs.readFileSync(filename, 'utf8').split('\n').filter(line => line.trim() !== '');
  } catch (err) {
    console.error(chalk.red(`Error reading ${filename}: ${err.message}`));
    process.exit(1);
  }
};

// Validasi alamat
const isValidAddress = (address) => {
  return ethers.isAddress(address);
};

// Validasi private key
const isValidPrivateKey = (privateKey) => {
  try {
    return new ethers.Wallet(privateKey);
  } catch {
    return false;
  }
};

// Format angka ke satuan yang tepat
const formatUnits = (value, decimals = 18) => {
  return ethers.formatUnits(value, decimals);
};

// Parse satuan
const parseUnits = (value, decimals = 18) => {
  return ethers.parseUnits(value.toString(), decimals);
};

module.exports = {
  readFile,
  isValidAddress,
  isValidPrivateKey,
  formatUnits,
  parseUnits
};
