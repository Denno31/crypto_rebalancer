const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

// Mock dependencies
const mockDb = {
  coinSnapshot: {
    findOne: sinon.stub(),
    findAll: sinon.stub(),
    create: sinon.stub(),
    findOrCreate: sinon.stub()
  },
  coinUnitTracker: {
    findOne: sinon.stub(),
    create: sinon.stub()
  },
  priceHistory: {
    create: sinon.stub()
  },
  logEntry: {
    log: sinon.stub()
  }
};

// Mock price service
const mockPriceService = {
  getPrice: sinon.stub()
};

// Initialize service with mocks
const snapshotManager = proxyquire('../../src/services/snapshotManager.service', {
  '../models': mockDb,
  './price.service': mockPriceService
});

describe('SnapshotManager Service', () => {
  beforeEach(() => {
    // Reset all stubs before each test
    sinon.reset();
  });

  describe('createInitialSnapshots', () => {
    it('should create initial snapshots for all coins', async () => {
      // Mock data setup
      const bot = { 
        id: 1, 
        name: 'Test Bot', 
        initialCoin: 'ETH', 
        referenceCoin: 'USDT',
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      // Mock no existing snapshots
      mockDb.coinSnapshot.findAll.resolves([]);
      
      // Mock price service responses
      mockPriceService.getPrice.withArgs(
        systemConfig, apiConfig, 'BTC', 'USDT', 1
      ).resolves({ price: 40000, source: 'binance' });
      
      mockPriceService.getPrice.withArgs(
        systemConfig, apiConfig, 'ETH', 'USDT', 1
      ).resolves({ price: 2000, source: 'binance' });
      
      mockPriceService.getPrice.withArgs(
        systemConfig, apiConfig, 'ADA', 'USDT', 1
      ).resolves({ price: 0.5, source: 'binance' });
      
      // Mock snapshot creation
      mockDb.coinSnapshot.create.resolves({
        id: sinon.stub().returns(1),
        botId: 1,
        coin: sinon.stub(),
        initialPrice: sinon.stub(),
        snapshotTimestamp: sinon.stub(),
        wasEverHeld: sinon.stub(),
        unitsHeld: sinon.stub(),
        ethEquivalentValue: sinon.stub(),
        maxUnitsReached: sinon.stub()
      });
      
      // Execute the method
      const result = await snapshotManager.createInitialSnapshots(
        bot, systemConfig, apiConfig
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(mockDb.coinSnapshot.findAll.calledOnce).to.be.true;
      expect(mockPriceService.getPrice.calledThrice).to.be.true; // Called 3 times
      expect(mockDb.coinSnapshot.create.calledThrice).to.be.true; // One for each coin
      expect(mockDb.priceHistory.create.calledThrice).to.be.true; // One for each coin
    });
    
    it('should use existing snapshots if they exist', async () => {
      // Mock data setup
      const bot = { 
        id: 1, 
        name: 'Test Bot', 
        initialCoin: 'ETH', 
        referenceCoin: 'USDT',
        getCoinsArray: sinon.stub().returns(['BTC', 'ETH', 'ADA'])
      };
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      // Mock existing snapshots
      const existingSnapshots = [
        { botId: 1, coin: 'BTC', initialPrice: 40000 },
        { botId: 1, coin: 'ETH', initialPrice: 2000 },
        { botId: 1, coin: 'ADA', initialPrice: 0.5 }
      ];
      mockDb.coinSnapshot.findAll.resolves(existingSnapshots);
      
      // Execute the method
      const result = await snapshotManager.createInitialSnapshots(
        bot, systemConfig, apiConfig
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.message).to.equal('Using existing snapshots');
      expect(mockDb.coinSnapshot.findAll.calledOnce).to.be.true;
      expect(mockPriceService.getPrice.called).to.be.false;
      expect(mockDb.coinSnapshot.create.called).to.be.false;
    });
    
    it('should handle errors gracefully', async () => {
      // Mock data setup
      const bot = { 
        id: 1, 
        name: 'Test Bot', 
        initialCoin: 'ETH', 
        referenceCoin: 'USDT',
        getCoinsArray: sinon.stub().returns([])
      };
      const systemConfig = { priceSourcePriority: ['binance', 'coingecko'] };
      const apiConfig = { apiKey: 'test', apiSecret: 'test' };
      
      // Execute the method
      const result = await snapshotManager.createInitialSnapshots(
        bot, systemConfig, apiConfig
      );
      
      // Verify results
      expect(result.success).to.be.false;
      expect(result.message).to.include('Failed to create initial snapshots');
      expect(mockDb.logEntry.log.calledOnce).to.be.true;
    });
  });

  describe('updateCoinUnits', () => {
    it('should update existing tracker and snapshot', async () => {
      // Mock data
      const bot = { id: 1 };
      const coin = 'BTC';
      const units = 0.05;
      const price = 40000;
      
      // Mock existing tracker
      const mockTracker = {
        units: 0.04,
        lastUpdated: new Date('2023-01-01'),
        save: sinon.stub().resolves(true)
      };
      mockDb.coinUnitTracker.findOne.resolves(mockTracker);
      
      // Mock existing snapshot
      const mockSnapshot = {
        unitsHeld: 0.04,
        wasEverHeld: true,
        maxUnitsReached: 0.04,
        save: sinon.stub().resolves(true)
      };
      mockDb.coinSnapshot.findOne.resolves(mockSnapshot);
      
      // Execute the method
      const result = await snapshotManager.updateCoinUnits(
        bot, coin, units, price
      );
      
      // Verify results
      expect(result).to.equal(mockTracker);
      expect(mockTracker.units).to.equal(units);
      expect(mockTracker.save.calledOnce).to.be.true;
      expect(mockSnapshot.unitsHeld).to.equal(units);
      expect(mockSnapshot.maxUnitsReached).to.equal(units); // Should update as new amount is higher
      expect(mockSnapshot.save.calledOnce).to.be.true;
      expect(mockDb.logEntry.log.calledTwice).to.be.true; // Log for update and for max units
    });
    
    it('should create new tracker if none exists', async () => {
      // Mock data
      const bot = { id: 1 };
      const coin = 'BTC';
      const units = 0.05;
      const price = 40000;
      
      // No existing tracker
      mockDb.coinUnitTracker.findOne.resolves(null);
      
      // Mock tracker creation
      const mockTracker = {
        id: 1,
        botId: 1,
        coin: 'BTC',
        units: 0.05,
        lastUpdated: sinon.stub()
      };
      mockDb.coinUnitTracker.create.resolves(mockTracker);
      
      // Mock existing snapshot
      const mockSnapshot = {
        unitsHeld: 0,
        wasEverHeld: false,
        maxUnitsReached: 0,
        save: sinon.stub().resolves(true)
      };
      mockDb.coinSnapshot.findOne.resolves(mockSnapshot);
      
      // Execute the method
      const result = await snapshotManager.updateCoinUnits(
        bot, coin, units, price
      );
      
      // Verify results
      expect(result).to.equal(mockTracker);
      expect(mockDb.coinUnitTracker.create.calledOnce).to.be.true;
      expect(mockSnapshot.unitsHeld).to.equal(units);
      expect(mockSnapshot.wasEverHeld).to.be.true; // Should be marked as held
      expect(mockSnapshot.maxUnitsReached).to.equal(units);
      expect(mockSnapshot.save.calledOnce).to.be.true;
    });
    
    it('should handle errors gracefully', async () => {
      // Mock data
      const bot = { id: 1 };
      const coin = 'BTC';
      const units = 0.05;
      const price = 40000;
      
      // Force an error
      const testError = new Error('Database error');
      mockDb.coinUnitTracker.findOne.rejects(testError);
      
      // Execute and expect error to be thrown
      try {
        await snapshotManager.updateCoinUnits(bot, coin, units, price);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.equal(testError);
        expect(mockDb.logEntry.log.calledOnce).to.be.true; // Error should be logged
      }
    });
  });

  describe('getInitialPrices', () => {
    it('should return a map of coin symbols to initial prices', async () => {
      // Mock data
      const botId = 1;
      
      // Mock snapshots
      const mockSnapshots = [
        { coin: 'BTC', initialPrice: 40000 },
        { coin: 'ETH', initialPrice: 2000 },
        { coin: 'ADA', initialPrice: 0.5 }
      ];
      mockDb.coinSnapshot.findAll.resolves(mockSnapshots);
      
      // Execute the method
      const result = await snapshotManager.getInitialPrices(botId);
      
      // Verify results
      expect(result).to.deep.equal({
        BTC: 40000,
        ETH: 2000,
        ADA: 0.5
      });
      expect(mockDb.coinSnapshot.findAll.calledOnce).to.be.true;
      expect(mockDb.coinSnapshot.findAll.firstCall.args[0].where).to.deep.equal({ botId });
    });
    
    it('should handle errors gracefully', async () => {
      // Mock data
      const botId = 1;
      
      // Force an error
      const testError = new Error('Database error');
      mockDb.coinSnapshot.findAll.rejects(testError);
      
      // Execute and expect error
      try {
        await snapshotManager.getInitialPrices(botId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.equal(testError);
      }
    });
  });
});
