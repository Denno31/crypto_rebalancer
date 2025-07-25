/**
 * Migration for trade decision transparency features
 * Adds decision_reason and deviation_percentage to trades table
 * Creates missed_trades table for tracking missed trade opportunities
 */
const Sequelize = require('sequelize');

module.exports = {
  /**
   * Apply the migration
   * @param {Object} params - Migration parameters
   * @param {Object} params.context - Migration context
   * @param {Object} params.context.queryInterface - QueryInterface instance
   * @param {Object} params.context.transaction - Current transaction
   * @returns {Promise} - Promise resolving when migration is applied
   */
  async up({ context: { queryInterface, transaction } }) {
    console.log('Starting migration for trade decision transparency features');
    
    // Add decision_reason and deviation_percentage columns to trades table
    console.log('Adding columns to trades table...');
    await queryInterface.addColumn(
      'trades',
      'decision_reason',
      {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Explanation for why this trade was executed'
      },
      { transaction }
    );
    
    await queryInterface.addColumn(
      'trades',
      'deviation_percentage',
      {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Deviation percentage that triggered this trade'
      },
      { transaction }
    );
    
    // Create missed_trades table
    console.log('Creating missed_trades table...');
    await queryInterface.createTable(
      'missed_trades',
      {
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
        reason: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: 'Explanation for why this trade opportunity was missed'
        },
        score: {
          type: Sequelize.FLOAT,
          allowNull: true,
          comment: 'Score that was calculated but insufficient for trade'
        },
        deviation_percentage: {
          type: Sequelize.FLOAT,
          allowNull: true,
          comment: 'Deviation percentage observed'
        },
        threshold: {
          type: Sequelize.FLOAT,
          allowNull: true,
          comment: 'Threshold required to execute the trade'
        },
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
      },
      { transaction }
    );

    console.log('Migration for trade decision transparency features completed');
  },

  /**
   * Rollback the migration
   * @param {Object} params - Migration parameters
   * @param {Object} params.context - Migration context
   * @param {Object} params.context.queryInterface - QueryInterface instance
   * @param {Object} params.context.transaction - Current transaction
   * @returns {Promise} - Promise resolving when migration is rolled back
   */
  async down({ context: { queryInterface, transaction } }) {
    console.log('Rolling back trade decision transparency features');
    
    // Remove columns from trades table
    await queryInterface.removeColumn('trades', 'decision_reason', { transaction });
    await queryInterface.removeColumn('trades', 'deviation_percentage', { transaction });
    
    // Drop missed_trades table
    await queryInterface.dropTable('missed_trades', { transaction });
    
    console.log('Rolled back trade decision transparency features');
  }
};
