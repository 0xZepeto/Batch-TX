const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const getNetworks = () => {
  try {
    const filePath = path.join(__dirname, '..', 'rpc.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(chalk.red('❌ Error reading rpc.json:'), error.message);
    process.exit(1);
  }
};

const selectNetwork = async (networks) => {
  const inquirer = require('inquirer');
  const choices = Object.entries(networks).map(([id, net]) => ({
    name: `${net.name} (${net.symbol})`,
    value: id
  }));

  const { networkId } = await inquirer.prompt([{
    type: 'list',
    name: 'networkId',
    message: chalk.cyan('🌐 Pilih Jaringan:'),
    choices,
    pageSize: 10
  }]);

  return { networkId, ...networks[networkId] };
};

module.exports = { getNetworks, selectNetwork };
