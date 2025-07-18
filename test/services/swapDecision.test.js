const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock dependencies
const mockDb = {
  bot: {
    findByPk: sinon.stub()
  },
  coinSnapshot: {
    findOne: sinon.stub(),
    findAll: sinon.stub()
  },
  coinUnitTracker: {
    findOne: sinon.stub()
  },
  logEntry: {
    log: sinon.stub()
  },
  botAsset: {
    findOne: sinon.stub()
  },
  trade: {
    findAll: sinon.stub()
  },
  Sequelize: {
    Op: {
      gte: Symbol('gte'),
      lte: Symbol('lte')
    }
  }
};

// Mock deviation calculator
const mockDeviationCalculator = {
  calculateSwapMetrics: sinon.stub(),
  calculateSwapWorthinessScore: sinon.stub(),
  storeDeviationRecord: sinon.stub()
};

// Mock snapshot manager
const mockSnapshotManager = {
  getInitialPrices: sinon.stub(),
  updateCoinUnits: sinon.stub()
};

// Initialize service with mocks
const swapDecision = proxyquire('../../src/services/swapDecision.service', {
  '../models': mockDb,
  './deviationCalculator.service': mockDeviationCalculator,
  './snapshotManager.service': mockSnapshotManager
});


describe('SwapDecision Service', () => {
  beforeEach(() => {
    // Reset all stubs before each test
    sinon.reset();
  });

  describe('evaluateSwapCandidates', () => {
    beforeEach(() => {
      // Reset specific stub for checkGlobalProgressProtection before each test
      if (swapDecision.checkGlobalProgressProtection.restore) {
        swapDecision.checkGlobalProgressProtection.restore();
      }
    });
    
    it('should return best swap candidate when viable option exists', async () => {
      // Stub the checkGlobalProgressProtection method for this test
      sinon.stub(swapDecision, 'checkGlobalProgressProtection').resolves({ allowed: true });
      // Mock data setup
      const bot = { 
        id: 1, 
        name: 'Test Bot', 
        currentCoin: 'ETH', 
        thresholdPercentage: 5,
        commissionRate: 0.002,
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      
      const priceData = {
        'BTC': { price: 40000, source: 'binance' },
        'ETH': { price: 2000, source: 'binance' },
        'ADA': { price: 0.5, source: 'binance' }
      };
      
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      // Mock initial prices
      mockSnapshotManager.getInitialPrices.resolves({
        'BTC': 38000,
        'ETH': 1900,
        'ADA': 0.55
      });
      
      // Mock swap metrics for BTC
      mockDeviationCalculator.calculateSwapMetrics
        .withArgs(bot, 'ETH', 'BTC', 2000, 40000, sinon.match.any)
        .resolves({
          relativeDeviation: -3.5,
          initialDeviation: 5.26,
          isPumped: true,
          potentialUnits: 0.05,
          previousMaxUnits: 0.048,
          unitGainPercentage: 4.17,
          currentPrice: 2000,
          targetPrice: 40000
        });
      
      // Mock swap metrics for ADA
      mockDeviationCalculator.calculateSwapMetrics
        .withArgs(bot, 'ETH', 'ADA', 2000, 0.5, sinon.match.any)
        .resolves({
          relativeDeviation: 6.0,
          initialDeviation: -9.09,
          isPumped: false,
          potentialUnits: 4000,
          previousMaxUnits: 3800,
          unitGainPercentage: 5.26,
          currentPrice: 2000,
          targetPrice: 0.5
        });
      
      // Mock swap worthiness scores
      mockDeviationCalculator.calculateSwapWorthinessScore
        .withArgs(sinon.match({ relativeDeviation: -3.5 }), 5, 0.002)
        .returns({
          rawScore: -3.5,
          effectiveScore: -3.9,
          meetsThreshold: false,
          breakdown: {
            baseDeviation: -3.5,
            commissionImpact: 0.4,
            pumpPenalty: 0,
            unitEconomics: 4.17,
            effectiveThreshold: 5.4
          }
        });
      
      mockDeviationCalculator.calculateSwapWorthinessScore
        .withArgs(sinon.match({ relativeDeviation: 6.0 }), 5, 0.002)
        .returns({
          rawScore: 6.0,
          effectiveScore: 5.6,
          meetsThreshold: true,
          breakdown: {
            baseDeviation: 6.0,
            commissionImpact: 0.4,
            pumpPenalty: 0,
            unitEconomics: 5.26,
            effectiveThreshold: 5.4
          }
        });
      
      // Execute the method
      const result = await swapDecision.evaluateSwapCandidates(
        bot, priceData, systemConfig, apiConfig
      );
      
      // Verify results
      expect(result.shouldSwap).to.be.true;
      expect(result.bestCandidate.coin).to.equal('ADA');
      expect(mockSnapshotManager.getInitialPrices.calledOnce).to.be.true;
      expect(mockDeviationCalculator.calculateSwapMetrics.calledTwice).to.be.true;
      expect(mockDeviationCalculator.calculateSwapWorthinessScore.calledTwice).to.be.true;
      expect(mockDb.logEntry.log.called).to.be.true;
    });
    
    it('should handle case with no current coin set', async () => {
      // Mock data setup
      const bot = { 
        id: 1, 
        name: 'Test Bot', 
        currentCoin: null, // No current coin
        thresholdPercentage: 5,
        commissionRate: 0.002,
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      
      const priceData = {
        'BTC': { price: 40000, source: 'binance' },
        'ETH': { price: 2000, source: 'binance' },
        'ADA': { price: 0.5, source: 'binance' }
      };
      
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      // Execute the method
      const result = await swapDecision.evaluateSwapCandidates(
        bot, priceData, systemConfig, apiConfig
      );
      
      // Verify results
      expect(result.shouldSwap).to.be.false;
      expect(result.reason).to.equal('No current coin set');
      expect(result.bestCandidate).to.be.null;
      expect(mockDb.logEntry.log.calledOnce).to.be.true;
    });
    
    it('should handle case with no viable candidates', async () => {
      // Mock data setup
      const bot = { 
        id: 1, 
        name: 'Test Bot', 
        currentCoin: 'ETH',
        thresholdPercentage: 5,
        commissionRate: 0.002,
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      
      const priceData = {
        'BTC': { price: 40000, source: 'binance' },
        'ETH': { price: 2000, source: 'binance' },
        'ADA': { price: 0.5, source: 'binance' }
      };
      
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      // Mock initial prices
      mockSnapshotManager.getInitialPrices.resolves({
        'BTC': 38000,
        'ETH': 1900,
        'ADA': 0.55
      });
      
      // Mock swap metrics where no coin meets threshold
      mockDeviationCalculator.calculateSwapMetrics
        .resolves({
          relativeDeviation: 2.0, // Below threshold
          initialDeviation: 0,
          isPumped: false,
          potentialUnits: 0,
          previousMaxUnits: 0,
          unitGainPercentage: 0
        });
      
      // Mock swap worthiness scores
      mockDeviationCalculator.calculateSwapWorthinessScore
        .returns({
          rawScore: 2.0,
          effectiveScore: 1.6,
          meetsThreshold: false, // Doesn't meet threshold
          breakdown: {
            baseDeviation: 2.0,
            commissionImpact: 0.4,
            pumpPenalty: 0,
            unitEconomics: 0,
            effectiveThreshold: 5.4
          }
        });
      
      // Execute the method
      const result = await swapDecision.evaluateSwapCandidates(
        bot, priceData, systemConfig, apiConfig
      );
      
      // Verify results
      expect(result.shouldSwap).to.be.false;
      expect(result.reason).to.equal('No candidates meet threshold criteria');
      expect(result.bestCandidate).to.be.null;
      expect(result.candidates).to.be.an('array');
    });
  });

  describe('checkGlobalProgressProtection', () => {
    it('should allow swap when progress protection passes', async () => {
      // Mock data
      const bot = { 
        id: 1,
        currentCoin: 'ETH',
        globalPeakValueInETH: 1.0,
        globalThresholdPercentage: 10,
        commissionRate: 0.002
      };
      
      const candidate = {
        coin: 'BTC',
        metrics: {
          currentPrice: 2000
        },
        price: 40000
      };
      
      // Mock current asset
      mockDb.botAsset.findOne.resolves({
        amount: 1.5,
        entryPrice: 1900
      });
      
      // Mock target snapshot with good unit economics
      mockDb.coinSnapshot.findOne
        .withArgs({ where: { botId: 1, coin: 'BTC' } })
        .resolves({
          wasEverHeld: true,
          maxUnitsReached: 0.07
        });
      
      // Execute the method
      const result = await swapDecision.checkGlobalProgressProtection(
        bot, candidate
      );
      
      // Verify results - should allow the swap
      expect(result.allowed).to.be.true;
    });
    
    it('should block swap when it would result in fewer units', async () => {
      // Mock data
      const bot = { 
        id: 1,
        currentCoin: 'ETH',
        globalPeakValueInETH: 1.0,
        globalThresholdPercentage: 10,
        commissionRate: 0.002
      };
      
      const candidate = {
        coin: 'BTC',
        metrics: {
          currentPrice: 2000
        },
        price: 40000
      };
      
      // Mock current asset
      mockDb.botAsset.findOne.resolves({
        amount: 1.5,
        entryPrice: 1900
      });
      
      // Mock target snapshot with better previous units
      mockDb.coinSnapshot.findOne
        .withArgs({ where: { botId: 1, coin: 'BTC' } })
        .resolves({
          wasEverHeld: true,
          maxUnitsReached: 0.08 // Higher than what we would get
        });
      
      // Execute the method
      const result = await swapDecision.checkGlobalProgressProtection(
        bot, candidate
      );
      
      // Verify results - should block the swap
      expect(result.allowed).to.be.false;
      expect(result.reason).to.include('fewer units');
    });
    
    it('should handle missing asset data', async () => {
      // Mock data
      const bot = { 
        id: 1,
        currentCoin: 'ETH'
      };
      
      const candidate = {
        coin: 'BTC',
        metrics: {
          currentPrice: 2000
        },
        price: 40000
      };
      
      // Mock missing asset
      mockDb.botAsset.findOne.resolves(null);
      
      // Execute the method
      const result = await swapDecision.checkGlobalProgressProtection(
        bot, candidate
      );
      
      // Verify results - should block the swap
      expect(result.allowed).to.be.false;
      expect(result.reason).to.include('Missing asset data');
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should calculate correct performance metrics', async () => {
      // Mock bot data
      const bot = {
        id: 1,
        initialCoin: 'BTC',
        currentCoin: 'ETH',
        totalCommissionsPaid: 100,
        globalPeakValueInETH: 1.5,
        createdAt: new Date('2023-01-01')
      };
      mockDb.bot.findByPk.resolves(bot);
      
      // Mock snapshots
      mockDb.coinSnapshot.findOne
        .withArgs({ where: { botId: 1, coin: 'BTC' } })
        .resolves({
          unitsHeld: 0.05
        });
      
      mockDb.coinSnapshot.findOne
        .withArgs({ where: { botId: 1, coin: 'ETH' } })
        .resolves({
          unitsHeld: 1.5,
          ethEquivalentValue: 1.2
        });
      
      // Mock trades
      mockDb.trade.findAll.resolves([
        { id: 1, fromCoin: 'BTC', toCoin: 'ETH', executed_at: new Date() },
        { id: 2, fromCoin: 'ETH', toCoin: 'ADA', executed_at: new Date() },
        { id: 3, fromCoin: 'ADA', toCoin: 'ETH', executed_at: new Date() }
      ]);
      
      // Execute the method
      const metrics = await swapDecision.getPerformanceMetrics(1);
      
      // Verify results
      expect(metrics.initialCoin).to.equal('BTC');
      expect(metrics.currentCoin).to.equal('ETH');
      expect(metrics.initialUnits).to.equal(0.05);
      expect(metrics.currentUnits).to.equal(1.5);
      expect(metrics.totalTrades).to.equal(3);
      expect(metrics.totalCommissions).to.equal(100);
      expect(metrics.globalPeakValueInETH).to.equal(1.5);
      expect(metrics.currentValueInETH).to.equal(1.2);
      expect(metrics.valueChangePercentage).to.be.a('number');
    });
    
    it('should handle missing bot', async () => {
      // Mock missing bot
      mockDb.bot.findByPk.resolves(null);
      
      // Execute and expect error
      try {
        await swapDecision.getPerformanceMetrics(1);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Bot with ID 1 not found');
      }
    });
  });
});
