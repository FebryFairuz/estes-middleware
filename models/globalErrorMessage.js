'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class GlobalErrorMessage extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  GlobalErrorMessage.init({
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    DescriptionUser: DataTypes.TEXT,
    Description: DataTypes.TEXT,
    ErrorCode: DataTypes.STRING,
    ResponseCode: DataTypes.STRING
  }, {
    sequelize,
    tableName:"md_error_message",
    modelName: 'GlobalErrorMessage',
    primaryKey: 'ID',
    timestamps: false,
    id: false, 
  });
  return GlobalErrorMessage;
};