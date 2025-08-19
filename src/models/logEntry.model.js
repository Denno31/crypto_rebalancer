module.exports = (sequelize, Sequelize) => {
  const LogEntry = sequelize.define("logEntry", {
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
    botId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      field: 'bot_id',
      references: {
        model: 'bots',
        key: 'id'
      }
    },
    resetCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'reset_count'
    }
  }, {
    tableName: 'logs',
    timestamps: false,
    indexes: [
      {
        fields: ['bot_id']
      },
      {
        fields: ['timestamp']
      },
      {
        fields: ['level']
      }
    ]
  });

  // Static method to log messages
  LogEntry.log = async function(db, level, message, botId = null) {
    try {
      const entry = await this.create({
        level: level.toUpperCase(),
        message,
        botId,
        timestamp: new Date()
      });
      
      console.log(`[${level.toUpperCase()}] ${message}`);
      
      return entry;
    } catch (error) {
      console.error('Error logging message:', error);
    }
  };

  return LogEntry;
};
