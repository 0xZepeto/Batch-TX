const ethers = require('ethers');
const { parseUnits, formatUnits } = require('./helpers');

// ABI ERC20 minimal
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// Kirim Native Token
const sendNative = async (provider, wallet, to, amount, options = {}) => {
  const tx = {
    to,
    value: parseUnits(amount.toString(), 18),
    ...options
  };

  const txResponse = await wallet.sendTransaction(tx);
  return txResponse;
};

// Kirim Token ERC20/BEP20
const sendToken = async (provider, wallet, tokenAddress, to, amount, options = {}) => {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const decimals = await contract.decimals();
  
  const tx = await contract.transfer(to, parseUnits(amount.toString(), decimals), {
    ...options
  });
  
  return tx;
};

// Dapatkan saldo Native
const getNativeBalance = async (provider, address) => {
  const balance = await provider.getBalance(address);
  return formatUnits(balance, 18);
};

// Dapatkan saldo Token
const getTokenBalance = async (provider, tokenAddress, walletAddress) => {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const decimals = await contract.decimals();
  const balance = await contract.balanceOf(walletAddress);
  return formatUnits(balance, decimals);
};

module.exports = {
  sendNative,
  sendToken,
  getNativeBalance,
  getTokenBalance
};
