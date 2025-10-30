const ethers = require('ethers');
const chalk = require('chalk');
const ora = require('ora');

const sendNativeToken = async (provider, wallet, to, amount, network) => {
  const spinner = ora(chalk.yellow(`Mengirim ${network.symbol}...`)).start();
  
  try {
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(amount.toString()),
      gasLimit: 21000
    });
    
    spinner.text = chalk.yellow(`Menunggu konfirmasi... Hash: ${tx.hash}`);
    await tx.wait();
    
    spinner.succeed(chalk.green(`✅ Berhasil! Hash: ${tx.hash}`));
    return { success: true, hash: tx.hash };
  } catch (error) {
    spinner.fail(chalk.red(`❌ Gagal: ${error.reason || error.message}`));
    return { success: false, error: error.message };
  }
};

const sendERC20Token = async (provider, wallet, tokenAddress, to, amount, network) => {
  const spinner = ora(chalk.yellow(`Mengirim Token...`)).start();
  
  try {
    const abi = ["function transfer(address to, uint amount) returns (bool)"];
    const contract = new ethers.Contract(tokenAddress, abi, wallet);
    
    const decimals = await contract.decimals();
    const tx = await contract.transfer(to, ethers.parseUnits(amount.toString(), decimals));
    
    spinner.text = chalk.yellow(`Menunggu konfirmasi... Hash: ${tx.hash}`);
    await tx.wait();
    
    spinner.succeed(chalk.green(`✅ Berhasil! Hash: ${tx.hash}`));
    return { success: true, hash: tx.hash };
  } catch (error) {
    spinner.fail(chalk.red(`❌ Gagal: ${error.reason || error.message}`));
    return { success: false, error: error.message };
  }
};

const getBalance = async (provider, address, network) => {
  try {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error(chalk.red(`❌ Error getting balance: ${error.message}`));
    return "0";
  }
};

module.exports = { sendNativeToken, sendERC20Token, getBalance };
