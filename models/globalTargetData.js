'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class GlobalTargetData extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  GlobalTargetData.init({
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Name: DataTypes.STRING,
    Description: DataTypes.TEXT,
    Prefik: DataTypes.STRING,
    Url: DataTypes.STRING,
    Param: DataTypes.STRING,
    IsPath: DataTypes.STRING,
    Type: DataTypes.STRING,
  }, {
    sequelize,
    tableName:"md_global_enum",
    modelName: 'GlobalTargetData',
    primaryKey: 'ID',
    timestamps: false,
    id: false, 
  });
  return GlobalTargetData;
};