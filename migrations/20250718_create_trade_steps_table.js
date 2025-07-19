/**
 * Migration to create the trade_steps table for tracking multi-step trades
 * Created on: 2025-07-18
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.createTable('trade_steps', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        parent_trade_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'trades',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        step_number: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        trade_id: {
          type: Sequelize.STRING,
          allowNull: false
        },
        from_coin: {
          type: Sequelize.STRING,
          allowNull: false
        },
        to_coin: {
          type: Sequelize.STRING,
          allowNull: false
        },
        from_amount: {
          type: Sequelize.FLOAT,
          allowNull: false
        },
        to_amount: {
          type: Sequelize.FLOAT,
          allowNull: false
        },
        from_price: {
          type: Sequelize.FLOAT,
          allowNull: false
        },
        to_price: {
          type: Sequelize.FLOAT,
          allowNull: false
        },
        commission_amount: {
          type: Sequelize.FLOAT,
          allowNull: true
        },
        status: {
          type: Sequelize.STRING,
          allowNull: false
        },
        executed_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        raw_trade_data: {
          type: Sequelize.JSON,
          allowNull: true
        }
      });

      // Add indexes for better query performance
      await queryInterface.addIndex('trade_steps', ['parent_trade_id']);
      await queryInterface.addIndex('trade_steps', ['trade_id']);
      await queryInterface.addIndex('trade_steps', ['status']);
      await queryInterface.addIndex('trade_steps', ['executed_at']);

      console.log('Successfully created trade_steps table');
      return Promise.resolve();
    } catch (error) {
      console.error('Error creating trade_steps table:', error);
      return Promise.reject(error);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.dropTable('trade_steps');
      console.log('Successfully dropped trade_steps table');
      return Promise.resolve();
    } catch (error) {
      console.error('Error dropping trade_steps table:', error);
      return Promise.reject(error);
    }
  }
};
