const { QueryTypes } = require("sequelize");
const CryptoJS = require("crypto-js");
const axios = require("axios");
const {
  Sequelize,
  sequelize,
  SystemParam,
  GlobalTargetData,
  GlobalErrorMessage,
  ConsumerKeyAccount,
  SessionUserAccount,
} = require("../models");
const { response } = require("express");

exports.authentication = async (req, res) => {
  const headers = req.headers;
  const APP_ID = headers["app-id"];
  const APP_ENV = headers["app-env"];

  const reqdata = req.body;
  let response;

  if (APP_ID && APP_ID.length <= 36 && APP_ENV) {
    if (reqdata["username"] && reqdata["password"]) {
      reqdata["typeCK"] = reqdata["typeCK"] ? reqdata["typeCK"] : "production";

      //Get Public Key
      const sys_param = await FindSystemParam("private-key", APP_ENV);
      const public_key = sys_param ? sys_param.Value : "";
      //End Get Public Key

      //decrypt password
      let decryptPass;
      try {
        decryptPass = CryptoJSAesJson.decrypt(
          JSON.stringify(reqdata["password"]),
          public_key
        );
      } catch (error) {
        console.log("Failed decrypt password");
      }

      //end decrypt

      //get consumer key
      const get_consumer_key = await FindConsumerKey(
        APP_ENV,
        reqdata["typeCK"],
        1
      );
      const consumer_key_acc = get_consumer_key
        ? JSON.parse(get_consumer_key.Account)
        : "";
      //end consumer key

      //find role of user by email
      let role_user = { name: "", id: 0, consumer_key: "" };
      if (consumer_key_acc) {
        if (reqdata["username"].includes("@sgu")) {
          role_user = {
            name: "Staff",
            id: 3,
            consumer_key: consumer_key_acc.key.staff,
          };
        } else if (reqdata["username"].includes("@student")) {
          role_user = {
            name: "Student",
            id: 1,
            consumer_key: consumer_key_acc.key.student,
          };
        } else if (reqdata["username"].includes("@lecturer")) {
          role_user = {
            name: "Lecturer",
            id: 2,
            consumer_key: consumer_key_acc.key.lecturer,
          };
        } else {
          role_user = { name: "Guest", id: 4, consumer_key: "" };
        }
      }
      //end of find role user

      if (role_user.consumer_key) {
        if (decryptPass) {
          //check account to jaguar api
          const account_user = {
            email: reqdata["username"],
            password: decryptPass,
          };
          const app_device = { APP_ID, APP_ENV };
          let results = await CheckAccount(
            account_user,
            role_user,
            app_device,
            get_consumer_key,
            public_key
          );
          response = results;
          //End check existing account
        } else {
          let results = await FindAnErrorMessage("03001");
          response = {
            message: results,
            results: "error",
          };
        }
      } else {
        let results = await FindAnErrorMessage("03008");
        response = {
          message: results,
          results: "error",
        };
      }
    } else {
      let results = await FindAnErrorMessage("04006");
      response = {
        message: results,
        results: "error",
      };
    }
  } else {
    let results = await FindAnErrorMessage("03004");
    response = {
      message: results,
      results: "error",
    };
  }

  res.status(200).json(response);

  const PostLog = await PostLog2Rabbit(headers, reqdata, response);
  console.log("PostLog",PostLog);
};

const CheckAccount = async (
  account,
  role_user,
  app_device,
  consumer_key,
  public_key
) => {
  let results;
  //Get Base URI
  let uriAPI = await GetBaseURIAPI(consumer_key, "login", account.email);
  //End  Get Base URI

  //Check account is already login by this app-env
  const isExistingUser = await FindAccountSession(
    app_device.APP_ID,
    app_device.APP_ENV,
    account.email
  );
  if (isExistingUser) {
    const delete_user = await SessionUserAccount.destroy({
      where: {
        [Sequelize.Op.or]: [
          { [Sequelize.Op.and]: [{ App_ID: app_device.APP_ID }] },
          {
            [Sequelize.Op.and]: [
              { UserID: account.email },
              { AppEnvironment: app_device.APP_ENV },
            ],
          },
        ],
      },
    });
  }

  //access to api jaguar to get a new token
  const qs = require("qs");
  let param = qs.stringify({
    username: account.email,
    grant_type: "password",
    scope: "openid",
    password: account.password,
  });
  const consumer_key_arr = role_user.consumer_key.split("Authorization:");
  const consumer_key_user = consumer_key_arr[consumer_key_arr.length - 1];
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: consumer_key_user,
  };
  let GetToken = await ExecuteLoginAPI(param, uriAPI, headers);
  if (GetToken.result !== "error") {
    //decode token_id for get the user info
    const token_id_arr = GetToken.id_token.split(/\./);
    const token_id = token_id_arr[1];
    const decode_token_id = atob(token_id);
    const obj_token_user = JSON.parse(decode_token_id);
    //end decode token_id

    //insert to db
    let identity_user = {
      given_name: obj_token_user.given_name,
      family_name: obj_token_user.family_name,
      email: obj_token_user.email,
      roles: obj_token_user.groups,
      role: role_user.name,
      roleid: role_user.id,
    };

    if (obj_token_user.empID) {
      identity_user.entityid = parseInt(obj_token_user.empID);
      identity_user.empid = obj_token_user.sub;
    } else {
      identity_user.entityid = parseInt(obj_token_user.sub);
    }

    const GetKey = GenerateSecretKey(account.email, public_key);
    const secret_key = GetKey.secret_key ? GetKey.secret_key : "";
    const expited_time = GetKey.expired ? GetKey.expired : "";

    //insert token user to db
    const dataTokenDB = {
      UserID: account.email,
      App_ID: app_device.APP_ID,
      AppEnvironment: app_device.APP_ENV,
      SecretKey: secret_key,
      ExpiredSession: expited_time,
      BearerToken: GetToken.access_token,
      id_token: GetToken.id_token,
      refresh_token: GetToken.refresh_token,
    };
    const insert_token_user = await SessionUserAccount.create(dataTokenDB);
    //end insert token

    const msgSuccess = {
      internal: "Success sign-in.",
      user: "Success sign-in. Welcome " + dataTokenDB.UserID,
    };
    results = {
      identity: identity_user,
      secretkey: secret_key,
      message: msgSuccess,
      result: "success",
    };
  } else {
    const msgError = await FindAnErrorMessage("01003");
    results = {
      message: GetToken.message ? GetToken.message : msgError,
      result: "error",
    };
  }

  return results;
  //end access api
};

const GenerateSecretKey = (mail, public_key) => {
  const sign = require("jwt-encode");
  const currDate = new Date();
  const timestamp = currDate.getTime() + 60 * 60 * 1000; // 1 jam dalam milidetik
  const expiredTime = new Date(timestamp);
  const trimDate = expiredTime.toISOString().replace(/\s+/g, "");
  const trimUserID = mail.replace(/\s+/g, "");
  const secretKeyText = trimDate + "-" + trimUserID;

  const encodeScKey = sign(secretKeyText, public_key);
  // hashing enc secret key using sha256
  const secretKey = require("crypto")
    .createHash("sha256")
    .update(encodeScKey)
    .digest("hex");

  return { secret_key: secretKey, expired: expiredTime.toISOString() };
};

const FindAnErrorMessage = async (code) => {
  let results = [];
  try {
    const result = await GlobalErrorMessage.findOne({
      where: {
        ErrorCode: code,
      },
    });
    const msgError = {
      internal: result.Description,
      user: result.DescriptionUser,
    };
    results = msgError;
  } catch (error) {
    const msgError = {
      internal: "Failed retrive, " + error,
      user: "Failed retrive data:" + error,
    };
    results = msgError;
  }

  return results;
};

const FindSystemParam = async (tipe, name) => {
  let results = [];
  try {
    const result = await SystemParam.findOne({
      where: {
        Tipe: tipe,
        Name: name,
      },
    });
    results = result;
  } catch (error) {
    const msgError = {
      internal: "Failed retrive, " + error,
      user: "Failed retrive data:" + error,
    };
    results = msgError;
  }

  return results;
};

const FindConsumerKey = async (name, type, IsMain) => {
  let results = [];
  try {
    const result = await ConsumerKeyAccount.findOne({
      where: {
        Description: type,
        Name: name,
        IsMain: IsMain,
      },
    });
    results = result;
  } catch (error) {
    const msgError = {
      internal: "Failed retrive, " + error,
      user: "Failed retrive data:" + error,
    };
    results = msgError;
  }

  return results;
};

const FindAccountSession = async (app_id, app_env, email) => {
  let results = [];
  try {
    const result = await SessionUserAccount.findAll({
      where: {
        [Sequelize.Op.or]: [
          {
            [Sequelize.Op.and]: [
              { App_ID: app_id },
              { AppEnvironment: app_env },
            ],
          },
          {
            [Sequelize.Op.and]: [
              { UserID: email },
              { AppEnvironment: app_env },
            ],
          },
        ],
      },
    });
    results = result;
  } catch (error) {
    const msgError = {
      internal: "Failed retrive, " + error,
      user: "Failed retrive data:" + error,
    };
    results = msgError;
  }

  return results;
};

const ExecuteLoginAPI = async (data, uri, headers) => {
  let results = [];

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: uri,
    headers,
    data: data,
  };
  let responses = await axios(config)
    .then(function (response) {
      results = response.data;
      return results;
    })
    .catch(function (e) {
      results = {
        message: {
          internal: e.response.data.error_description,
          user: e.response.data.error_description,
        },
        result: "error",
      };
      return results;
    });

  return responses;
};

const GetBaseURIAPI = async (config, tipe, mail) => {
  const getPort = await FindSystemParam("port", tipe);
  const getURL = await FindSystemParam("base_uri", config.Type);
  let uriAPI = "";
  if (getPort && getURL) {
    uriAPI = getURL.Value + ":" + getPort.Value;
  }
  if (tipe === "login") {
    const getPath = await FindSystemParam("token_path", config.Type);
    uriAPI = uriAPI + (getPath ? getPath.Value : "");
  } else if (tipe === "req-module") {
    let mailArr = mail.split("@");
    mailUser = mailArr[mailArr.length - 1];
    uriAPI = uriAPI + "/t/" + mailUser;
  }
  return uriAPI;
};

var CryptoJSAesJson = {
  encrypt: function (value, password) {
    return CryptoJS.AES.encrypt(JSON.stringify(value), password, {
      format: CryptoJSAesJson,
    }).toString();
  },

  decrypt: function (jsonStr, password) {
    return JSON.parse(
      CryptoJS.AES.decrypt(jsonStr, password, {
        format: CryptoJSAesJson,
      }).toString(CryptoJS.enc.Utf8)
    );
  },

  stringify: function (cipherParams) {
    var j = { ct: cipherParams.ciphertext.toString(CryptoJS.enc.Base64) };
    if (cipherParams.iv) j.iv = cipherParams.iv.toString();
    if (cipherParams.salt) j.s = cipherParams.salt.toString();
    return JSON.stringify(j).replace(/\s/g, "");
  },

  parse: function (jsonStr) {
    var j = JSON.parse(jsonStr);
    var cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(j.ct),
    });
    if (j.iv) cipherParams.iv = CryptoJS.enc.Hex.parse(j.iv);
    if (j.s) cipherParams.salt = CryptoJS.enc.Hex.parse(j.s);
    return cipherParams;
  },
};

const PostLog2Rabbit = async (headers, param, response) => {
  const moment = require("moment");
  const isOpenDebug = await FindSystemParam("open-debug", headers["app-env"]);
  if (isOpenDebug) {
    if (isOpenDebug.Value === "true") {
      const GetURIRabbit = await FindConsumerKey("post-log", "production", 1);
      if (GetURIRabbit) {
        const rabbit_account = JSON.parse(GetURIRabbit.Account);
        const paramLog = {
          origin: "middleware",
          user: param["username"],
          code: 506,
          service: "Login",
          response: response,
          type: "",
          transid: "",
          param: param,
          request_app_id: headers["app-id"],
          request_app: headers["app-env"],
          created: moment().format("YYYY-MM-DD HH:mm:ss"),
        };
        const exchange = "msa.direct.log";
        const routing = "request";

        const amqp = require("amqplib");
        const configAcc = {
          hostname: GetURIRabbit.URL,
          port: parseInt(GetURIRabbit.Port),
          username: rabbit_account.name,
          password: rabbit_account.password,
          vhost: "log",
        };

        try {
          const connection = await amqp.connect(configAcc);
          if (!connection) {
            throw new Error("Gagal yeuh konek ke RabbitMQ");
          }

          const channel = await connection.createChannel();
          if (!channel) {
            throw new Error("Gagal yeun bikin channel");
          }

          const logMessage = JSON.stringify(paramLog);

          //deklarasi exchange
          await channel.assertExchange(exchange, "direct", { durable: true });

          //send message to exchange with routing
          await channel.publish(exchange, routing, Buffer.from(logMessage), {
            contentType: "application/json",
            deliveryMode: 2,
          });
        //   setTimeout(() => {
        //     connection.close();
        //   }, 500);

        await connection.close();
        } catch (error) {
          console.log("Error RabbitMQ:", error.message);
        }
      }
    }
  }
};
