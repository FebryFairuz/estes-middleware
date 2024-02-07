'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SystemParam extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  SystemParam.init({
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Name: DataTypes.STRING,
    Tipe: DataTypes.STRING,
    Value: DataTypes.STRING,
  }, {
    sequelize,
    tableName:"system_param",
    modelName: 'SystemParam',
    primaryKey: 'ID',
    timestamps: false,
    id: false, 
  });
  return SystemParam;
};