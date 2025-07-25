const fs = require('fs');
const path = require('path');

// The trading pairs list from 3Commas API
const tradingPairs = [
  "USDT_BTC", "USDT_ETH", "USDT_XRP", "USDT_BCH", "USDT_LTC", "USDT_BNB", "BTC_ETH", "BTC_BNB",
  "USDT_ADA", "USDT_BAT", "USDT_ETC", "USDT_XLM", "USDT_ZRX", "USDT_DOGE", "USDT_ATOM", "USDT_NEO",
  "USDT_VET", "USDT_QTUM", "USDT_ONT", "BTC_ADA", "USDT_KNC", "USDT_VTHO", "USDT_COMP", "USDT_MKR",
  "USDT_ONE", "USDT_BAND", "USDT_STORJ", "USDT_UNI", "USDT_SOL", "USDT_EGLD", "USDT_PAXG", "USDT_OXT",
  "USDT_ZEN", "USDC_BTC", "USDT_FIL", "USDT_AAVE", "USDT_GRT", "USDT_SHIB", "USDT_CRV", "USDT_AXS",
  "BTC_SOL", "USDT_AVAX", "USDT_CTSI", "USDT_DOT", "USDT_YFI", "USDT_1INCH", "USDT_USDC", "USDC_ETH",
  "USDT_MANA", "USDT_ALGO", "USDT_LINK", "USDT_EOS", "USDT_ZEC", "USDT_ENJ", "USDT_NEAR", "USDT_SUSHI",
  "USDT_LRC", "USDT_LPT", "USDT_NMR", "USDT_SLP", "USDT_CHZ", "USDT_OGN", "USDT_GALA", "USDT_TLM",
  "USDT_SNX", "USDT_AUDIO", "USDT_ENS", "BTC_WBTC", "USDT_REQ", "USDT_APE", "USDT_FLUX", "USDT_COTI",
  "USDT_VOXEL", "USDT_RLC", "USDT_BICO", "USDT_API3", "USDT_BNT", "USDT_IMX", "USDT_FLOW", "USDT_GTC",
  "USDT_THETA", "USDT_TFUEL", "USDT_OCEAN", "USDT_LAZIO", "USDT_SANTOS", "USDT_ALPINE", "USDT_PORTO",
  "USDT_CELR", "USDT_SKL", "USDT_WAXP", "USDT_LTO", "USDT_FET", "USDT_LOKA", "USDT_ICP", "USDT_T",
  "USDT_OP", "USDT_ROSE", "USDT_CELO", "USDT_KDA", "USDT_KSM", "USDT_ACH", "USDT_SYS", "USDT_RAD",
  "USDT_ILV", "USDT_LDO", "USDT_RARE", "USDT_LSK", "USDT_DGB", "USDT_REEF", "USDT_ALICE", "USDT_FORTH",
  "USDT_ASTR", "USDT_BTRST", "USDT_SAND", "USDT_GLM", "USDT_QNT", "USDT_STG", "USDT_AXL", "USDT_KAVA",
  "USDT_APT", "USDT_MASK", "USDT_BOSON", "USDT_POND", "USDC_SOL", "USDC_ADA", "USDT_JAM", "USDT_TRAC",
  "USDT_PROM", "USDT_DIA", "USDT_LOOM", "USDT_STMX", "USD_BTC", "USD_ETH", "USD_BCH", "USD_LTC",
  "USD_USDT", "USD_BNB", "USD_ADA", "USD_ETC", "USD_XLM", "USD_LINK", "USD_RVN", "USD_ALGO", "USD_IOTA",
  "USD_ATOM", "USD_ZIL", "USD_VET", "USD_HBAR", "USD_DOGE", "USD_VTHO", "USD_USDC", "USD_ONE", "USD_UNI",
  "USD_SOL", "USD_AAVE", "USD_GRT", "USD_SUSHI", "USD_CRV", "USD_AVAX", "USD_DOT", "USD_NEAR", "USD_LPT",
  "USD_GALA", "USD_ENS", "USD_THETA", "USD_FET", "USD_ICP", "USD_OP", "USD_KDA", "USD_DGB", "USD_SAND",
  "USD_SHIB", "USDT_POLYX", "USDT_IOST", "USDT_ARB", "USDT_FLOKI", "USD_FLOKI", "USDT_XEC", "USDT_BLUR",
  "USDT_ANKR", "USDT_DAI", "USDT_DASH", "USDT_HBAR", "USDT_ICX", "USDT_IOTA", "USDT_RVN", "USDT_XNO",
  "USDT_XTZ", "USDT_ZIL", "USDT_ORBS", "USDT_ADX", "USDT_FORT", "USDT_SUI", "USDT_ONG", "USDT_G",
  "USDT_RENDER", "USDT_BONK", "USDT_MAGIC", "USDT_PEPE", "USDT_WIF", "USDT_IOTX", "USDT_PNUT",
  "USDT_PENGU", "USDT_POL", "USDT_TRUMP", "USDT_NEIRO", "USD_SUI", "USD_XRP", "USD_BONK", "USD_PEPE",
  "USD_POL", "USD_RENDER", "USD_TRUMP", "USDT_EIGEN", "USDT_ME", "USD_ME", "USDT_D", "USDT_METIS",
  "USD_JUP", "USDT_JUP", "USD_S", "USDT_S", "USDT_JTO", "USDT_ORCA", "USDT_DATA", "USDT_VIRTUAL",
  "USDT_AIXBT", "USDT_KAITO", "USDT_TURBO", "USD_HYPE", "USDT_HYPE", "USDT_ENA", "USDT_LAYER",
  "USDT_FARTCOIN", "USDT_SPX", "USDT_POPCAT", "USDT_MOODENG", "USDT_ANIME", "USDT_1000MOG", "USDT_ONDO",
  "USDT_1000REKT"
];

/**
 * Extract unique coins from trading pairs
 * @returns {Array} Array of unique coin symbols
 */
function extractUniqueCoins() {
  const uniqueCoins = new Set();
  
  // Process each trading pair
  tradingPairs.forEach(pair => {
    const [baseCoin, targetCoin] = pair.split('_');
    uniqueCoins.add(baseCoin);
    uniqueCoins.add(targetCoin);
  });
  
  // Convert set to sorted array
  return Array.from(uniqueCoins).sort();
}

/**
 * Group coins by base currency
 * @returns {Object} Object with base currencies as keys and arrays of target currencies as values
 */
function groupCoinsByBase() {
  const pairsByBase = {};
  
  // Process each trading pair
  tradingPairs.forEach(pair => {
    const [baseCoin, targetCoin] = pair.split('_');
    
    if (!pairsByBase[baseCoin]) {
      pairsByBase[baseCoin] = [];
    }
    
    pairsByBase[baseCoin].push(targetCoin);
  });
  
  // Sort target coins for each base
  Object.keys(pairsByBase).forEach(base => {
    pairsByBase[base].sort();
  });
  
  return pairsByBase;
}

// Extract and save the data
const uniqueCoins = extractUniqueCoins();
const pairsByBase = groupCoinsByBase();

// Create data object
const coinsData = {
  allCoins: uniqueCoins,
  pairsByBase: pairsByBase,
  lastUpdated: new Date().toISOString()
};

// Save to JSON file
const outputPath = path.join(__dirname, '..', '..', 'data', 'availableCoins.json');

// Ensure data directory exists
const dataDir = path.dirname(outputPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Write data to file
fs.writeFileSync(outputPath, JSON.stringify(coinsData, null, 2));

console.log(`Extracted ${uniqueCoins.length} unique coins`);
console.log(`Found ${Object.keys(pairsByBase).length} base currencies`);
console.log(`Data saved to ${outputPath}`);

// Export the data in case we want to use it programmatically
module.exports = {
  uniqueCoins,
  pairsByBase
};
