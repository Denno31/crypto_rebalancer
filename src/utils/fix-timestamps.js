/**
 * Script to fix timestamp column mappings in all models
 * This will update model definitions to use snake_case timestamps
 */

require('dotenv').config();
const db = require('../models');

console.log('Fixing timestamp mappings for all models...');

// Loop through all models
Object.keys(db).forEach(modelName => {
  // Skip the Sequelize and sequelize properties
  if (modelName === 'Sequelize' || modelName === 'sequelize') {
    return;
  }
  
  const model = db[modelName];
  
  // Skip if not a proper model
  if (!model.options) {
    return;
  }
  
  // Update the model options
  if (model.options.timestamps) {
    console.log(`Setting timestamp options for model: ${modelName}`);
    model.options.underscored = true; // Use snake_case
    model.options.createdAt = 'created_at';
    model.options.updatedAt = 'updated_at';
  }
});

console.log('Timestamp mappings updated for all models');

// Now try to fetch a bot as a test
async function testQuery() {
  try {
    console.log('Testing query...');
    const bots = await db.bot.findAll({
      where: { enabled: true }
    });
    
    console.log(`Found ${bots.length} enabled bots`);
    
    if (bots.length > 0) {
      // Just output the first bot's data to validate
      console.log('First bot data:', {
        id: bots[0].id,
        name: bots[0].name,
        coins: bots[0].coins,
        createdAt: bots[0].created_at || bots[0].createdAt
      });
    }
    
    console.log('Query successful!');
  } catch (error) {
    console.error('Error in test query:', error);
  } finally {
    await db.sequelize.close();
  }
}

// Run a test query
testQuery();
