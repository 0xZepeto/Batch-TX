const fs = require('fs');
const path = require('path');

const readLines = (filename) => {
  try {
    const filePath = path.join(__dirname, '..', filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return data.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error(`Error reading ${filename}:`, error.message);
    process.exit(1);
  }
};

module.exports = { readLines };
