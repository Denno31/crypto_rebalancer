'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('Creating bot_swap_decisions table...');
    
    // Check if table already exists
    try {
      await queryInterface.describeTable('bot_swap_decisions');
      console.log('bot_swap_decisions table already exists');
      return;
    } catch (error) {
      // Table doesn't exist, proceed with creation
    }
    
    // Create the bot_swap_decisions table
    await queryInterface.createTable('bot_swap_decisions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      bot_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'bots',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      from_coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      to_coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      // Price data
      from_coin_price: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      to_coin_price: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      from_coin_snapshot: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      to_coin_snapshot: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      // Deviation metrics
      price_deviation_percent: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      price_threshold: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      deviation_triggered: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Value metrics
      unit_gain_percent: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      eth_equivalent_value: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      min_eth_equivalent: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      // Global protection
      global_peak_value: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      global_protection_triggered: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Decision outcome
      swap_performed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // If a swap was performed, reference the trade
      trade_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'trades',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    
    // Create indexes for performance
    await queryInterface.addIndex('bot_swap_decisions', ['bot_id'], {
      name: 'bot_swap_decisions_bot_id_idx'
    });
    
    await queryInterface.addIndex('bot_swap_decisions', ['from_coin', 'to_coin'], {
      name: 'bot_swap_decisions_coins_idx'
    });
    
    await queryInterface.addIndex('bot_swap_decisions', ['swap_performed'], {
      name: 'bot_swap_decisions_swap_performed_idx'
    });
    
    await queryInterface.addIndex('bot_swap_decisions', ['created_at'], {
      name: 'bot_swap_decisions_created_at_idx'
    });
    
    console.log('bot_swap_decisions table created successfully');
  },

  down: async (queryInterface, Sequelize) => {
    console.log('Dropping bot_swap_decisions table...');
    try {
      await queryInterface.dropTable('bot_swap_decisions');
      console.log('bot_swap_decisions table dropped successfully');
    } catch (error) {
      console.error('Error dropping bot_swap_decisions table:', error);
    }
  }
};
