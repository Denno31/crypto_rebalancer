const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock dependencies
const mockDb = {
  coinSnapshot: {
    findOne: sinon.stub()
  },
  coinDeviation: {
    create: sinon.stub()
  },
  logEntry: {
    log: sinon.stub()
  }
};

// Initialize service with mocks
const deviationCalculator = proxyquire('../../src/services/deviationCalculator.service', {
  '../models': mockDb
});

describe('DeviationCalculator Service', () => {
  beforeEach(() => {
    // Reset all stubs before each test
    sinon.reset();
  });

  describe('calculateSwapMetrics', () => {
    it('should calculate correct deviation metrics between coins', async () => {
      // Mock data setup
      const bot = { id: 1 };
      const currentCoin = 'ETH';
      const targetCoin = 'BTC';
      const currentPrice = 2000;
      const targetPrice = 40000;
      const initialPrices = {
        ETH: 1800,
        BTC: 38000
      };

      // Mock database responses
      mockDb.coinSnapshot.findOne.withArgs({ where: { botId: 1, coin: 'ETH' } })
        .resolves({
          initialPrice: 1800,
          unitsHeld: 1.5,
          maxUnitsReached: 1.5,
          wasEverHeld: true
        });

      mockDb.coinSnapshot.findOne.withArgs({ where: { botId: 1, coin: 'BTC' } })
        .resolves({
          initialPrice: 38000,
          unitsHeld: 0,
          maxUnitsReached: 0.05,
          wasEverHeld: true
        });

      mockDb.coinDeviation.create.resolves({
        id: 1,
        botId: 1,
        baseCoin: 'ETH',
        targetCoin: 'BTC',
        basePrice: 2000,
        targetPrice: 40000,
        deviationPercent: 5.26,
        timestamp: new Date()
      });

      // Execute the method
      const metrics = await deviationCalculator.calculateSwapMetrics(
        bot, currentCoin, targetCoin, currentPrice, targetPrice, initialPrices
      );

      // Verify the results
      expect(metrics).to.be.an('object');
      expect(metrics.relativeDeviation).to.be.a('number');
      expect(metrics.initialDeviation).to.be.a('number');
      expect(metrics.potentialUnits).to.be.a('number');
      
      // Check specific calculations
      // Current deviation ratio = 2000/1800 = 1.111
      // Target deviation ratio = 40000/38000 = 1.0526
      // Relative deviation = (1.0526/1.111) - 1 = -0.0526 = -5.26%
      expect(metrics.relativeDeviation).to.be.closeTo(-5.26, 0.1);
      
      // Initial deviation = (40000/38000) - 1 = 0.0526 = 5.26%
      expect(metrics.initialDeviation).to.be.closeTo(5.26, 0.1);
      
      // Check if the method called the database methods correctly
      expect(mockDb.coinSnapshot.findOne.calledTwice).to.be.true;
      expect(mockDb.coinDeviation.create.calledOnce).to.be.true;
    });

    it('should handle missing snapshots', async () => {
      // Mock data setup
      const bot = { id: 1 };
      const currentCoin = 'ETH';
      const targetCoin = 'BTC';
      const currentPrice = 2000;
      const targetPrice = 40000;
      const initialPrices = {
        ETH: 1800,
        BTC: 38000
      };

      // Mock database to return null for one of the snapshots
      mockDb.coinSnapshot.findOne.withArgs({ where: { botId: 1, coin: 'ETH' } })
        .resolves({
          initialPrice: 1800,
          unitsHeld: 1.5,
          maxUnitsReached: 1.5,
          wasEverHeld: true
        });

      mockDb.coinSnapshot.findOne.withArgs({ where: { botId: 1, coin: 'BTC' } })
        .resolves(null);

      // Execute and expect error
      try {
        await deviationCalculator.calculateSwapMetrics(
          bot, currentCoin, targetCoin, currentPrice, targetPrice, initialPrices
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Missing snapshot for BTC');
      }
    });

    it('should handle missing initial prices', async () => {
      // Mock data setup
      const bot = { id: 1 };
      const currentCoin = 'ETH';
      const targetCoin = 'BTC';
      const currentPrice = 2000;
      const targetPrice = 40000;
      const initialPrices = {
        ETH: 1800,
        // BTC is missing
      };

      // Mock database responses
      mockDb.coinSnapshot.findOne.withArgs({ where: { botId: 1, coin: 'ETH' } })
        .resolves({
          initialPrice: 1800,
          unitsHeld: 1.5,
          maxUnitsReached: 1.5,
          wasEverHeld: true
        });

      mockDb.coinSnapshot.findOne.withArgs({ where: { botId: 1, coin: 'BTC' } })
        .resolves({
          initialPrice: 38000,
          unitsHeld: 0,
          maxUnitsReached: 0.05,
          wasEverHeld: true
        });

      mockDb.coinDeviation.create.resolves({
        id: 1,
        botId: 1,
        baseCoin: 'ETH',
        targetCoin: 'BTC',
        basePrice: 2000,
        targetPrice: 40000,
        deviationPercent: 5.26,
        timestamp: new Date()
      });

      // Execute the method - should not throw but log a warning
      const metrics = await deviationCalculator.calculateSwapMetrics(
        bot, currentCoin, targetCoin, currentPrice, targetPrice, initialPrices
      );

      // Verify results - should still calculate but with initialDeviation as 0
      expect(metrics.initialDeviation).to.equal(0);
      expect(mockDb.logEntry.log.calledOnce).to.be.true;
    });
  });

  describe('calculateSwapWorthinessScore', () => {
    it('should calculate correct swap worthiness score', () => {
      // Test case 1: Good swap opportunity
      const goodMetrics = {
        relativeDeviation: 8.5, // 8.5% better than current coin
        initialDeviation: 3.0,  // 3% above initial price
        isPumped: false,
        potentialUnits: 0.06,
        previousMaxUnits: 0.05,
        unitGainPercentage: 20  // 20% more units
      };
      
      const thresholdPercentage = 5;
      // Commission rate removed
      
      const goodScore = deviationCalculator.calculateSwapWorthinessScore(
        goodMetrics, thresholdPercentage
      );
      
      expect(goodScore.rawScore).to.equal(8.5); // No penalties
      expect(goodScore.effectiveScore).to.equal(8.5); // No commission reduction
      expect(goodScore.meetsThreshold).to.be.true;
      
      // Test case 2: Bad swap - pumped coin
      const pumpedMetrics = {
        relativeDeviation: 8.5,
        initialDeviation: 15.0,  // 15% above initial price
        isPumped: true,
        potentialUnits: 0.06,
        previousMaxUnits: 0.05,
        unitGainPercentage: 20
      };
      
      const pumpedScore = deviationCalculator.calculateSwapWorthinessScore(
        pumpedMetrics, thresholdPercentage
      );
      
      expect(pumpedScore.rawScore).to.be.lessThan(goodScore.rawScore); // Should be penalized
      expect(pumpedScore.breakdown.pumpPenalty).to.be.greaterThan(0);
      
      // Test case 3: Bad swap - fewer units
      const fewerUnitsMetrics = {
        relativeDeviation: 8.5,
        initialDeviation: 3.0,
        isPumped: false,
        potentialUnits: 0.04,
        previousMaxUnits: 0.05,
        unitGainPercentage: -20  // 20% fewer units
      };
      
      const fewerUnitsScore = deviationCalculator.calculateSwapWorthinessScore(
        fewerUnitsMetrics, thresholdPercentage
      );
      
      expect(fewerUnitsScore.rawScore).to.equal(-100); // Heavily penalized
      expect(fewerUnitsScore.meetsThreshold).to.be.false;
    });
  });

  describe('storeDeviationRecord', () => {
    it('should store deviation record successfully', async () => {
      // Setup
      mockDb.coinDeviation.create.resolves({
        id: 1,
        botId: 1,
        baseCoin: 'ETH',
        targetCoin: 'BTC',
        basePrice: 2000,
        targetPrice: 40000,
        deviationPercent: 5.0,
        timestamp: new Date()
      });

      // Execute
      const result = await deviationCalculator.storeDeviationRecord(
        1, 'ETH', 'BTC', 2000, 40000, 5.0
      );

      // Verify
      expect(result).to.be.an('object');
      expect(result.id).to.equal(1);
      expect(mockDb.coinDeviation.create.calledOnce).to.be.true;
      expect(mockDb.coinDeviation.create.firstCall.args[0]).to.deep.include({
        botId: 1,
        baseCoin: 'ETH',
        targetCoin: 'BTC',
        basePrice: 2000,
        targetPrice: 40000,
        deviationPercent: 5.0
      });
    });

    it('should handle errors gracefully', async () => {
      // Setup - simulate a database error
      mockDb.coinDeviation.create.rejects(new Error('Database error'));

      // Execute
      const result = await deviationCalculator.storeDeviationRecord(
        1, 'ETH', 'BTC', 2000, 40000, 5.0
      );

      // Verify - should not throw but return null
      expect(result).to.be.null;
    });
  });

  describe('getHistoricalDeviation', () => {
    it('should fetch historical deviation data with filters', async () => {
      // Setup
      const mockDeviations = [
        { id: 1, botId: 1, baseCoin: 'ETH', targetCoin: 'BTC', timestamp: new Date() }
      ];
      mockDb.coinDeviation.findAll = sinon.stub().resolves(mockDeviations);

      // Execute
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-31');
      
      const result = await deviationCalculator.getHistoricalDeviation(
        1, 'ETH', 'BTC', startDate, endDate
      );

      // Verify
      expect(result).to.equal(mockDeviations);
      expect(mockDb.coinDeviation.findAll.calledOnce).to.be.true;
      const queryArg = mockDb.coinDeviation.findAll.firstCall.args[0];
      expect(queryArg.where).to.deep.include({
        botId: 1,
        baseCoin: 'ETH',
        targetCoin: 'BTC'
      });
      expect(queryArg.where.timestamp).to.exist;
    });
  });
});
