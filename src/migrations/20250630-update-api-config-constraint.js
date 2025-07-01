'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, drop the existing unique constraint on name only
    await queryInterface.removeConstraint('api_config', 'api_config_name_key');

    // Create a new composite unique constraint on name and user_id
    await queryInterface.addConstraint('api_config', {
      fields: ['name', 'user_id'],
      type: 'unique',
      name: 'api_config_name_user_id_key'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert: Drop the composite constraint
    await queryInterface.removeConstraint('api_config', 'api_config_name_user_id_key');

    // Restore the original constraint
    await queryInterface.addConstraint('api_config', {
      fields: ['name'],
      type: 'unique',
      name: 'api_config_name_key'
    });
  }
};
