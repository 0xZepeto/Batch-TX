import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const readFile = (filename) => {
  try {
    return fs.readFileSync(path.join(__dirname, filename), 'utf8')
      .split('\n')
      .filter(line => line.trim() !== '');
  } catch (error) {
    console.error(`❌ Error reading ${filename}:`, error.message);
    return [];
  }
};

export const writeFile = (filename, data) => {
  try {
    fs.writeFileSync(path.join(__dirname, filename), data, 'utf8');
  } catch (error) {
    console.error(`❌ Error writing ${filename}:`, error.message);
  }
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const retry = async (fn, retries = 3, delayMs = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(delayMs);
    }
  }
};
