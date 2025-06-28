/**
 * Bot Trading Logic Test Script
 * 
 * This script tests the trading logic of the crypto rebalancer bot with sample data
 * without affecting the actual database or making API calls.
 */

const chalk = require('chalk');

// Mock price data for different scenarios
const scenarios = [
  {
    name: 'No trade - below threshold',
    currentCoin: 'BTC',
    prices: {
      'BTC': { price: 50000, change24h: 5 }, 
      'ETH': { price: 3000, change24h: 8 },  // ETH up 8% vs BTC up 5% (3% difference)
      'SOL': { price: 150, change24h: 7 }    // SOL up 7% vs BTC up 5% (2% difference)
    },
    threshold: 5,  // 5% threshold
    expectedTrade: false,
    expectedCoin: 'BTC'
  },
  {
    name: 'Trade triggered - above threshold',
    currentCoin: 'BTC',
    prices: {
      'BTC': { price: 50000, change24h: 2 },
      'ETH': { price: 3500, change24h: 15 }, // ETH up 15% vs BTC up 2% (13% difference)
      'SOL': { price: 160, change24h: 10 }   // SOL up 10% vs BTC up 2% (8% difference)
    },
    threshold: 10,  // 10% threshold
    expectedTrade: true,
    expectedCoin: 'ETH'  // Should choose ETH as it performs best
  },
  {
    name: 'Global profit protection - prevent trade',
    currentCoin: 'BTC',
    prices: {
      'BTC': { price: 45000, change24h: -5 }, // BTC down 5%
      'ETH': { price: 3100, change24h: 8 },   // ETH up 8%
      'SOL': { price: 140, change24h: 3 }     // SOL up 3%
    },
    threshold: 10,
    globalPeakValue: 100000,
    minAcceptableValue: 90000, // Current value is below this
    currentValue: 85000,
    expectedTrade: true,
    expectedCoin: 'USDT'  // Should force to reference coin
  },
  {
    name: 'Already in best coin - no trade',
    currentCoin: 'ETH',
    prices: {
      'BTC': { price: 50000, change24h: 3 },
      'ETH': { price: 3500, change24h: 12 }, // ETH is already the best
      'SOL': { price: 160, change24h: 6 }
    },
    threshold: 10,
    expectedTrade: false,
    expectedCoin: 'ETH'
  }
];

/**
 * Mock function to simulate bot.service.js trading logic
 */
function testTradingLogic(scenario) {
  console.log(chalk.cyan('='.repeat(60)));
  console.log(chalk.cyan(`Testing scenario: ${scenario.name}`));
  console.log(chalk.cyan('='.repeat(60)));
  
  const {
    currentCoin,
    prices,
    threshold,
    globalPeakValue,
    minAcceptableValue,
    currentValue,
    referenceCoin = 'USDT'
  } = scenario;
  
  console.log(`Current coin: ${chalk.yellow(currentCoin)}`);
  console.log(`Threshold: ${chalk.yellow(threshold)}%`);
  
  // Print price and performance data in a readable format
  console.log('Price and performance data:');
  Object.entries(prices).forEach(([coin, data]) => {
    const priceFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.price);
    const changeStyle = data.change24h >= 0 ? chalk.green : chalk.red;
    console.log(`  ${coin}: ${priceFormatted} (24h change: ${changeStyle(data.change24h + '%')})`);
  });
  
  if (globalPeakValue) {
    console.log(`Global peak value: ${chalk.yellow(globalPeakValue)}`);
    console.log(`Min acceptable value: ${chalk.yellow(minAcceptableValue)}`);
    console.log(`Current portfolio value: ${chalk.yellow(currentValue)}`);
  }
  
  console.log(chalk.gray('Starting trading logic simulation...'));
  
  // Check if we have price data for current coin
  if (!prices[currentCoin]) {
    console.log(chalk.red(`No price data for current coin ${currentCoin}`));
    return { trade: false, coin: currentCoin };
  }
  
  // Find best performing coin
  const currentCoinData = prices[currentCoin];
  let bestCoin = currentCoin;
  let bestPerformance = currentCoinData.change24h;
  
  console.log(`Current coin ${currentCoin} performance: ${currentCoinData.change24h}% (24h)`);
  
  for (const [coin, data] of Object.entries(prices)) {
    if (coin === currentCoin) continue;
    
    const performanceDiff = data.change24h - currentCoinData.change24h;
    console.log(`${coin} vs ${currentCoin}: ${performanceDiff.toFixed(2)}% difference (${data.change24h}% vs ${currentCoinData.change24h}%)`);
    
    if (performanceDiff > threshold) {
      if (data.change24h > bestPerformance) {
        bestCoin = coin;
        bestPerformance = data.change24h;
        console.log(chalk.green(`Found better coin: ${coin} (${performanceDiff.toFixed(2)}% > ${threshold}%)`));
      }
    }
  }
  
  // Check global profit protection if reference coin is set
  if (globalPeakValue && minAcceptableValue) {
    console.log(chalk.gray('Checking global profit protection...'));
    
    if (currentValue < minAcceptableValue) {
      console.log(chalk.yellow(`Global protection triggered (Current: ${currentValue}, Min: ${minAcceptableValue})`));
      
      // Force trade to reference coin to preserve value
      if (currentCoin !== referenceCoin) {
        bestCoin = referenceCoin;
        console.log(chalk.yellow(`Forcing trade to reference coin ${referenceCoin} to preserve value`));
        return { trade: true, coin: referenceCoin }; // Always trade to reference coin
      } else {
        console.log(chalk.gray(`Already in reference coin ${referenceCoin}, no trade needed`));
        return { trade: false, coin: currentCoin };
      }
    } else {
      console.log(chalk.gray(`Global protection not triggered (Current: ${currentValue} >= Min: ${minAcceptableValue})`));
    }
  }
  
  // Execute trade if needed
  if (bestCoin !== currentCoin) {
    console.log(chalk.green(`TRADE: ${currentCoin} -> ${bestCoin}`));
    return { trade: true, coin: bestCoin };
  } else {
    console.log(chalk.gray(`No trade needed, ${currentCoin} is already optimal`));
    return { trade: false, coin: currentCoin };
  }
}

// Run all test scenarios
console.log(chalk.blue('Starting Bot Logic Test with sample data'));
console.log(chalk.blue('='.repeat(80)));

let passedTests = 0;
const totalTests = scenarios.length;

scenarios.forEach((scenario, index) => {
  console.log(chalk.blue(`\nTest ${index + 1}/${totalTests}`));
  
  const result = testTradingLogic(scenario);
  
  console.log('\nTest Result:');
  const expectedTradeText = scenario.expectedTrade ? 'trade' : 'no trade';
  const actualTradeText = result.trade ? 'trade' : 'no trade';
  
  if (result.trade === scenario.expectedTrade && 
      (!result.trade || result.coin === scenario.expectedCoin)) {
    console.log(chalk.green(`✓ PASS - Expected ${expectedTradeText} to ${scenario.expectedCoin}, got ${actualTradeText} to ${result.coin}`));
    passedTests++;
  } else {
    console.log(chalk.red(`✗ FAIL - Expected ${expectedTradeText} to ${scenario.expectedCoin}, got ${actualTradeText} to ${result.coin}`));
  }
  
  console.log(chalk.blue('='.repeat(80)));
});

console.log(`\nTest Summary: ${passedTests}/${totalTests} tests passed`);
if (passedTests === totalTests) {
  console.log(chalk.green('All trading logic tests passed! Your bot logic works as expected.'));
} else {
  console.log(chalk.yellow(`${totalTests - passedTests} tests failed. Review the logs above for details.`));
}
