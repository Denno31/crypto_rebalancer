const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock dependencies
const mockDb = {
  bot: {
    findByPk: sinon.stub(),
  },
  botAsset: {
    findOne: sinon.stub(),
    create: sinon.stub()
  },
  trade: {
    create: sinon.stub(),
    findAll: sinon.stub()
  },
  priceHistory: {
    create: sinon.stub()
  },
  logEntry: {
    log: sinon.stub()
  },
  systemConfig: {
    findOne: sinon.stub()
  },
  apiConfig: {
    findOne: sinon.stub()
  }
};

// Mock service dependencies
const mockThreeCommasService = function() {
  this.executeTrade = sinon.stub();
  this.getExchangeCommissionRates = sinon.stub();
};

const mockPriceService = {
  getPrice: sinon.stub()
};

const mockAssetManager = {
  lockAssets: sinon.stub(),
  releaseLock: sinon.stub(),
  canTradeAsset: sinon.stub()
};

const mockSnapshotManager = {
  createInitialSnapshots: sinon.stub(),
  updateCoinUnits: sinon.stub(),
  getInitialPrices: sinon.stub()
};

const mockDeviationCalculator = {
  calculateSwapMetrics: sinon.stub(),
  calculateSwapWorthinessScore: sinon.stub()
};

const mockSwapDecision = {
  evaluateSwapCandidates: sinon.stub(),
  checkGlobalProgressProtection: sinon.stub(),
  getPerformanceMetrics: sinon.stub()
};

// Use proxyquire to inject our mocks
const enhancedSwap = proxyquire('../../src/services/enhancedSwap.service', {
  '../models': mockDb,
  './threeCommas.service': mockThreeCommasService,
  './price.service': mockPriceService,
  './assetManager.service': mockAssetManager,
  './snapshotManager.service': mockSnapshotManager,
  './deviationCalculator.service': mockDeviationCalculator,
  './swapDecision.service': mockSwapDecision,
  'chalk': { 
    gray: (text) => text, 
    red: (text) => text, 
    yellow: (text) => text, 
    blue: (text) => text,
    cyan: (text) => text
  }
});

describe('EnhancedSwap Service', () => {
  beforeEach(() => {
    // Reset all stubs before each test
    sinon.reset();
  });

  describe('checkBot', () => {
    it('should handle bot with no current coin', async () => {
      // Mock bot data - no current coin but has initial coin
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        enabled: true,
        currentCoin: null,
        initialCoin: 'BTC',
        lastCheckTime: null,
        update: sinon.stub().resolves(true),
        save: sinon.stub().resolves(true),
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      mockDb.bot.findByPk.resolves(mockBot);
      
      // Mock successful initialization
      const initializeWithInitialCoin = sinon.stub(enhancedSwap, 'initializeWithInitialCoin')
        .resolves({
          success: true,
          message: 'Bot initialized with BTC',
          asset: { coin: 'BTC', amount: 0.05 }
        });
      
      // Mock successful snapshot creation
      mockSnapshotManager.createInitialSnapshots.resolves({
        success: true,
        message: 'Created snapshots',
        snapshots: []
      });
      
      // Execute the method
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      const result = await enhancedSwap.checkBot(1, systemConfig, apiConfig);
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.message).to.include('Bot initialized');
      expect(mockDb.bot.findByPk.calledOnce).to.be.true;
      
      // The update is called at least once for lastCheckTime - but may be called more
      // times in the initialization flow, so we use 'called' instead of 'calledOnce'
      expect(mockBot.update.called).to.be.true;
      expect(mockSnapshotManager.createInitialSnapshots.calledOnce).to.be.true;
      expect(initializeWithInitialCoin.calledOnce).to.be.true;
      
      // Restore the stub
      initializeWithInitialCoin.restore();
    });
    
    it('should evaluate swap candidates and execute trade when recommended', async () => {
      // Mock bot data with current coin
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        enabled: true,
        currentCoin: 'ETH',
        initialCoin: 'BTC',
        referenceCoin: 'USDT',
        thresholdPercentage: 5,
        commissionRate: 0.002,
        update: sinon.stub().resolves(true),
        save: sinon.stub().resolves(true),
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      mockDb.bot.findByPk.resolves(mockBot);
      
      // Mock successful snapshot creation
      mockSnapshotManager.createInitialSnapshots.resolves({
        success: true,
        message: 'Using existing snapshots',
        snapshots: []
      });
      
      // Mock price data
      mockPriceService.getPrice.resolves({
        price: 2000,
        source: 'binance'
      });
      
      // Mock swap evaluation with swap recommended
      mockSwapDecision.evaluateSwapCandidates.resolves({
        shouldSwap: true,
        bestCandidate: {
          coin: 'BTC',
          metrics: { 
            relativeDeviation: 6.0, 
            currentPrice: 2000 
          },
          scoreDetails: { 
            rawScore: 6.0, 
            effectiveScore: 5.6, 
            meetsThreshold: true 
          },
          price: 40000
        },
        candidates: [
          { coin: 'BTC' },
          { coin: 'ADA' }
        ]
      });
      
      // Mock trade execution
      const executeTrade = sinon.stub(enhancedSwap, 'executeTrade').resolves({
        success: true,
        tradeId: 'test123',
        fromCoin: 'ETH',
        toCoin: 'BTC',
        amount: 0.05,
        status: 'completed'
      });
      
      // Execute the method
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      const result = await enhancedSwap.checkBot(1, systemConfig, apiConfig);
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.message).to.include('Trade executed');
      expect(mockDb.bot.findByPk.calledOnce).to.be.true;
      expect(mockBot.update.calledOnce).to.be.true;
      expect(mockSnapshotManager.createInitialSnapshots.calledOnce).to.be.true;
      expect(mockPriceService.getPrice.called).to.be.true;
      expect(mockSwapDecision.evaluateSwapCandidates.calledOnce).to.be.true;
      expect(executeTrade.calledOnce).to.be.true;
      
      // Restore the stub
      executeTrade.restore();
    });
    
    it('should not execute trade when no swap is recommended', async () => {
      // Mock bot data with current coin
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        enabled: true,
        currentCoin: 'ETH',
        initialCoin: 'BTC',
        referenceCoin: 'USDT',
        update: sinon.stub().resolves(true),
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      mockDb.bot.findByPk.resolves(mockBot);
      
      // Mock successful snapshot creation
      mockSnapshotManager.createInitialSnapshots.resolves({
        success: true,
        message: 'Using existing snapshots',
        snapshots: []
      });
      
      // Mock price data
      mockPriceService.getPrice.resolves({
        price: 2000,
        source: 'binance'
      });
      
      // Mock swap evaluation with no swap recommended
      mockSwapDecision.evaluateSwapCandidates.resolves({
        shouldSwap: false,
        reason: 'No candidates meet threshold criteria',
        bestCandidate: null,
        candidates: []
      });
      
      // Execute the method
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      const result = await enhancedSwap.checkBot(1, systemConfig, apiConfig);
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.message).to.include('No swap needed');
      expect(mockDb.bot.findByPk.calledOnce).to.be.true;
      expect(mockBot.update.calledOnce).to.be.true;
      expect(mockSnapshotManager.createInitialSnapshots.calledOnce).to.be.true;
      expect(mockPriceService.getPrice.called).to.be.true;
      expect(mockSwapDecision.evaluateSwapCandidates.calledOnce).to.be.true;
    });
    
    it('should handle disabled bot', async () => {
      // Mock disabled bot
      mockDb.bot.findByPk.resolves({
        id: 1,
        name: 'Test Bot',
        enabled: false
      });
      
      // Execute the method
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      const result = await enhancedSwap.checkBot(1, systemConfig, apiConfig);
      
      // Verify results
      expect(result.success).to.be.false;
      expect(result.message).to.include('Bot not found or disabled');
      expect(mockDb.bot.findByPk.calledOnce).to.be.true;
    });
  });

  describe('executeTrade', () => {
    it('should execute trade successfully', async () => {
      // Mock bot data
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        userId: 1,
        update: sinon.stub().resolves(true),
        totalCommissionsPaid: 50
      };
      
      // Mock 3Commas client
      const mockThreeCommas = {
        executeTrade: sinon.stub().resolves([null, { status: 'completed', tradeId: 'test123' }])
      };
      
      // Mock asset manager
      mockAssetManager.canTradeAsset.resolves({ canTrade: true });
      mockAssetManager.lockAssets.resolves({ success: true, lockId: 'lock123' });
      
      // Mock botAsset for the asset we're selling
      mockDb.botAsset.findOne.resolves({
        coin: 'ETH',
        amount: 1.5,
        entryPrice: 1900,
        destroy: sinon.stub().resolves(true)
      });
      
      // Mock botAsset creation for the asset we're buying
      mockDb.botAsset.create.resolves({
        id: 2,
        botId: 1,
        coin: 'BTC',
        amount: 0.075
      });
      
      // Mock configs
      mockDb.systemConfig.findOne.resolves({ priceSourcePriority: ['binance', 'coingecko'] });
      mockDb.apiConfig.findOne.resolves({ apiKey: 'test', apiSecret: 'test' });
      
      // Mock swap candidate
      const swapCandidate = {
        coin: 'BTC',
        metrics: {
          currentPrice: 2000
        },
        price: 40000
      };
      
      // Execute the method
      const result = await enhancedSwap.executeTrade(
        mockBot,
        mockThreeCommas,
        'ETH',
        'BTC',
        swapCandidate
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.fromCoin).to.equal('ETH');
      expect(result.toCoin).to.equal('BTC');
      expect(mockAssetManager.lockAssets.calledOnce).to.be.true;
      expect(mockThreeCommas.executeTrade.calledOnce).to.be.true;
      expect(mockDb.botAsset.create.calledOnce).to.be.true;
      expect(mockSnapshotManager.updateCoinUnits.calledOnce).to.be.true;
      expect(mockBot.update.calledTwice).to.be.true;
      expect(mockDb.trade.create.calledOnce).to.be.true;
      expect(mockAssetManager.releaseLock.calledOnce).to.be.true;
    });
    
    it('should handle trade execution failure', async () => {
      // Mock bot data
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        update: sinon.stub().resolves(true)
      };
      
      // Mock 3Commas client with error
      const mockThreeCommas = {
        executeTrade: sinon.stub().resolves([new Error('3Commas API error'), null])
      };
      
      // Mock asset manager
      mockAssetManager.canTradeAsset.resolves({ canTrade: true });
      mockAssetManager.lockAssets.resolves({ success: true, lockId: 'lock123' });
      
      // Mock botAsset for the asset we're selling
      mockDb.botAsset.findOne.resolves({
        coin: 'ETH',
        amount: 1.5,
        entryPrice: 1900
      });
      
      // Mock configs
      mockDb.systemConfig.findOne.resolves({ priceSourcePriority: ['binance', 'coingecko'] });
      mockDb.apiConfig.findOne.resolves({ apiKey: 'test', apiSecret: 'test' });
      
      // Mock swap candidate
      const swapCandidate = {
        coin: 'BTC',
        metrics: {
          currentPrice: 2000
        },
        price: 40000
      };
      
      // Execute the method
      const result = await enhancedSwap.executeTrade(
        mockBot,
        mockThreeCommas,
        'ETH',
        'BTC',
        swapCandidate
      );
      
      // Verify results
      expect(result.success).to.be.false;
      expect(result.error).to.include('3Commas API error');
      expect(mockAssetManager.lockAssets.calledOnce).to.be.true;
      expect(mockThreeCommas.executeTrade.calledOnce).to.be.true;
      expect(mockDb.botAsset.create.called).to.be.false;
      expect(mockBot.update.called).to.be.false;
      expect(mockDb.trade.create.called).to.be.false;
      expect(mockAssetManager.releaseLock.calledOnce).to.be.true;
    });
    
    it('should handle simulation mode', async () => {
      // Mock bot data
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        userId: 1,
        update: sinon.stub().resolves(true),
        totalCommissionsPaid: 50
      };
      
      // Mock 3Commas client (shouldn't be called in simulation)
      const mockThreeCommas = {
        executeTrade: sinon.stub().resolves([null, { status: 'completed', tradeId: 'test123' }])
      };
      
      // Mock asset manager
      mockAssetManager.canTradeAsset.resolves({ canTrade: true });
      mockAssetManager.lockAssets.resolves({ success: true, lockId: 'lock123' });
      
      // Mock botAsset for the asset we're selling
      mockDb.botAsset.findOne.resolves({
        coin: 'ETH',
        amount: 1.5,
        entryPrice: 1900,
        destroy: sinon.stub().resolves(true)
      });
      
      // Mock botAsset creation for the asset we're buying
      mockDb.botAsset.create.resolves({
        id: 2,
        botId: 1,
        coin: 'BTC',
        amount: 0.075
      });
      
      // Mock configs
      mockDb.systemConfig.findOne.resolves({ priceSourcePriority: ['binance', 'coingecko'] });
      mockDb.apiConfig.findOne.resolves({ apiKey: 'test', apiSecret: 'test' });
      
      // Mock swap candidate
      const swapCandidate = {
        coin: 'BTC',
        metrics: {
          currentPrice: 2000
        },
        price: 40000
      };
      
      // Set environment to simulation mode
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      // Execute the method
      const result = await enhancedSwap.executeTrade(
        mockBot,
        mockThreeCommas,
        'ETH',
        'BTC',
        swapCandidate
      );
      
      // Reset environment
      process.env.NODE_ENV = originalEnv;
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.fromCoin).to.equal('ETH');
      expect(result.toCoin).to.equal('BTC');
      expect(result.tradeId).to.include('SIMULATED-');
      expect(mockAssetManager.lockAssets.calledOnce).to.be.true;
      expect(mockThreeCommas.executeTrade.called).to.be.false; // Should not call 3Commas in simulation
      expect(mockDb.botAsset.create.calledOnce).to.be.true;
      expect(mockSnapshotManager.updateCoinUnits.calledOnce).to.be.true;
      expect(mockBot.update.calledTwice).to.be.true;
      expect(mockDb.trade.create.calledOnce).to.be.true;
      expect(mockAssetManager.releaseLock.calledOnce).to.be.true;
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return comprehensive dashboard metrics', async () => {
      // Mock bot data
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        userId: 1,
        currentCoin: 'ETH',
        initialCoin: 'BTC',
        thresholdPercentage: 5,
        globalThresholdPercentage: 10,
        checkInterval: 15,
        lastCheckTime: new Date(),
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      mockDb.bot.findByPk.resolves(mockBot);
      
      // Mock current asset
      mockDb.botAsset.findOne.resolves({
        coin: 'ETH',
        amount: 1.5,
        entryPrice: 1900
      });
      
      // Mock configs
      mockDb.systemConfig.findOne.resolves({ priceSourcePriority: ['binance', 'coingecko'] });
      mockDb.apiConfig.findOne.resolves({ apiKey: 'test', apiSecret: 'test' });
      
      // Mock price service
      mockPriceService.getPrice.resolves({
        price: 2000,
        source: 'binance'
      });
      
      // Mock performance metrics
      mockSwapDecision.getPerformanceMetrics.resolves({
        initialCoin: 'BTC',
        currentCoin: 'ETH',
        unitGrowthPercentage: 10,
        totalTrades: 5
      });
      
      // Mock trades
      mockDb.trade.findAll.resolves([
        { id: 1, fromCoin: 'BTC', toCoin: 'ETH', executed_at: new Date() }
      ]);
      
      // Execute the method
      const result = await enhancedSwap.getDashboardMetrics(1);
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.bot.name).to.equal('Test Bot');
      expect(result.currentAsset.coin).to.equal('ETH');
      expect(result.currentAsset.amount).to.equal(1.5);
      expect(result.currentPrices).to.be.an('object');
      expect(result.deviations).to.be.an('object');
      expect(result.performance).to.be.an('object');
      expect(result.recentTrades).to.be.an('array');
    });
    
    it('should handle missing current coin', async () => {
      // Mock bot data with no current coin
      const mockBot = {
        id: 1,
        name: 'Test Bot',
        userId: 1,
        currentCoin: null,
        initialCoin: 'BTC'
      };
      mockDb.bot.findByPk.resolves(mockBot);
      
      // Execute the method
      const result = await enhancedSwap.getDashboardMetrics(1);
      
      // Verify results
      expect(result.success).to.be.false;
      expect(result.message).to.equal('No current coin set');
    });
  });
});
