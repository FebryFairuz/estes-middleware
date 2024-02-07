'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ConsumerKeyAccount extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ConsumerKeyAccount.init({
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Name: DataTypes.STRING,
    Description: DataTypes.TEXT,
    URL: DataTypes.STRING,
    Account: DataTypes.TEXT,
    Port: DataTypes.STRING,
    Type: DataTypes.STRING,
    IsMain: DataTypes.TINYINT,
  }, {
    sequelize,
    tableName:"config_user_account",
    modelName: 'ConsumerKeyAccount',
    primaryKey: 'ID',
    timestamps: false,
    id: false, 
  });
  return ConsumerKeyAccount;
};