/**
 * Script to check database table names
 * This will help us identify the exact table names in your database
 */

const db = require('../models');
const chalk = require('chalk');

async function checkTableNames() {
  try {
    console.log(chalk.blue('Checking database tables...'));
    console.log(chalk.blue('='.repeat(80)));
    
    // Get a list of all tables in the current database
    const tableQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const tables = await db.sequelize.query(tableQuery, { 
      type: db.sequelize.QueryTypes.SELECT
    });
    
    console.log(chalk.green(`Found ${tables.length} tables in the database:`));
    tables.forEach((t, i) => {
      console.log(`${i+1}. ${chalk.cyan(t.table_name)}`);
    });
    
    // For trades table, get more detailed information
    const tradesTableExists = tables.some(t => 
      t.table_name === 'trades' || t.table_name === 'trade'
    );
    
    if (tradesTableExists) {
      const tradesTableName = tables.find(t => 
        t.table_name === 'trades' || t.table_name === 'trade'
      ).table_name;
      
      console.log(chalk.blue(`\nDetails for ${tradesTableName} table:`));
      
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = '${tradesTableName}'
        ORDER BY ordinal_position;
      `;
      
      const columns = await db.sequelize.query(columnsQuery, {
        type: db.sequelize.QueryTypes.SELECT
      });
      
      console.log(chalk.green(`Found ${columns.length} columns:`));
      columns.forEach(col => {
        console.log(`- ${chalk.cyan(col.column_name)}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
      });
      
      // Check for existing records
      const recordsQuery = `
        SELECT COUNT(*) as count FROM ${tradesTableName};
      `;
      
      const [recordCount] = await db.sequelize.query(recordsQuery, {
        type: db.sequelize.QueryTypes.SELECT
      });
      
      console.log(chalk.blue(`\nCurrent ${tradesTableName} records: ${chalk.green(recordCount.count)}`));
    } else {
      console.log(chalk.yellow('\nNo trades table found in the database.'));
    }
    
    // Similarly, check for price history table
    const priceHistoryTable = tables.find(t => 
      t.table_name.includes('price') || t.table_name.includes('history')
    );
    
    if (priceHistoryTable) {
      console.log(chalk.blue(`\nFound price history table: ${chalk.green(priceHistoryTable.table_name)}`));
      
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = '${priceHistoryTable.table_name}'
        ORDER BY ordinal_position;
      `;
      
      const columns = await db.sequelize.query(columnsQuery, {
        type: db.sequelize.QueryTypes.SELECT
      });
      
      console.log(chalk.green(`Columns in ${priceHistoryTable.table_name}:`));
      columns.forEach(col => {
        console.log(`- ${chalk.cyan(col.column_name)}: ${col.data_type}`);
      });
    } else {
      console.log(chalk.yellow('\nNo price history table found with matching name pattern.'));
    }
    
  } catch (error) {
    console.error(chalk.red(`Error checking database tables: ${error.message}`));
    console.error(error);
  } finally {
    await db.sequelize.close();
  }
}

// Run the function
checkTableNames();
