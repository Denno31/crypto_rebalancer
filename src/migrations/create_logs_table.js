/**
 * Migration to create the logs table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      timestamp: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      level: {
        type: Sequelize.STRING,
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      bot_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'bots',
          key: 'id'
        }
      }
    });

    // Add indexes for performance
    await queryInterface.addIndex('logs', ['bot_id']);
    await queryInterface.addIndex('logs', ['timestamp']);
    await queryInterface.addIndex('logs', ['level']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('logs');
  }
};
