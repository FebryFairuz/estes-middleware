'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SessionUserAccount extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  SessionUserAccount.init({
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    App_ID: DataTypes.STRING,
    UserID: DataTypes.STRING,
    BearerToken: DataTypes.TEXT,
    id_token: DataTypes.TEXT,
    refresh_token: DataTypes.TEXT,
    ExpiredSession: DataTypes.DATE,
    SecretKey: DataTypes.TEXT,
    AppEnvironment: DataTypes.STRING
  }, {
    sequelize,
    tableName:"app_session_user",
    modelName: 'SessionUserAccount',
    primaryKey: 'ID',
    timestamps: false,
    id: false, 
  });
  return SessionUserAccount;
};