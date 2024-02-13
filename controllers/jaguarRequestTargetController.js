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

exports.requestModule = async (req, res) => {
  const headers = req.headers;
  const APP_ID = headers["app-id"];
  const APP_ENV = headers["app-env"];
  const APP_TIMESTAMP = headers["app-timestamp"];
  const APP_SIGNATURE = headers["app-signature"];

  const reqdata = req.body;

  let response;

  if (APP_ID && APP_ID.length <= 36 && APP_ENV) {
    if (reqdata) {
      if (reqdata["target_data"]) {
        //get bearer token user
        const isExistingUser = await FindAccountSession(APP_ID, APP_ENV);
        if (isExistingUser) {
          //hamming payload
          const isSameSignature = SignaturePayload(
            JSON.stringify(reqdata),
            isExistingUser.SecretKey,
            APP_SIGNATURE,
            APP_TIMESTAMP
          );
          if (isSameSignature) {
            //request target data to api jaguar
            const conditions = { Name: reqdata["target_data"] };
            const isExistTargetData = await FindAnTargetData(conditions);
            if (isExistTargetData) {
              const result = await GenerateRequestModule(
                isExistTargetData,
                reqdata,
                isExistingUser,
                APP_ENV
              );
              const responceAPI = result.result;
              if (responceAPI === "success") {
                response = {
                  response: result,
                  responseCode: 200,
                  result: responceAPI,
                };
              } else {
                response = {
                  response: result,
                  result: responceAPI,
                };
              }
            } else {
              let results = await FindAnErrorMessage("02005");
              response = {
                message: results,
                result: "error",
              };
            }
            //end request
          } else {
            let results = await FindAnErrorMessage("03006");
            response = {
              message: results,
              result: "error",
            };
          }
          //end hamming payload
        } else {
          let results = await FindAnErrorMessage("03005");
          response = {
            message: results,
            result: "error",
          };
        }
      } else {
        let results = await FindAnErrorMessage("04006");
        response = {
          message: results,
          result: "error",
        };
      }
    } else {
      let results = await FindAnErrorMessage("04004");
      response = {
        message: results,
        result: "error",
      };
    }
  } else {
    let results = await FindAnErrorMessage("03004");
    response = {
      message: results,
      result: "error",
    };
  }

  res.status(200).json(response);

  const PostLog = await PostLog2Rabbit(headers, reqdata, response);
};

const GenerateRequestModule = async (
  target_data,
  payload_data,
  current_user,
  app_env
) => {
  let response;
  const module_type = target_data.Type;
  const module_name = target_data.Name;
  const module_ispath = target_data.IsPath;
  const module_parameters = target_data.Param;
  const module_path_prefik = target_data.Prefik;
  const module_path_uri = target_data.Url;
  const BearerToken = current_user.BearerToken;
  const UserID = current_user.UserID;

  const path_target = await FindSystemParam("prefik-api", module_path_prefik);
  let current_path_uri =
    (path_target ? path_target.Value : "") + module_path_uri;

  //method GET
  if (module_type === "GET") {
    //TARGET_DATA for GET_PROFILE
    if (payload_data.target_data === "GET_PROFILE") {
      //Choose target data base on user email
      let target_data_selected = "";
      if (UserID.includes("@sgu")) {
        target_data_selected = "GET_EMP_BIO_BY_IDENID";
      } else if (UserID.includes("@student")) {
        target_data_selected = "GET_STUDENT_DATA_M";
      } else if (UserID.includes("@lecturer")) {
        target_data_selected = "GET_EMP_BIO_BY_IDENID";
      }
      //end target data profile

      const uriTargetData = await GetURIGetProfile(
        target_data_selected,
        current_user,
        app_env
      );
      const config = {
        method: "get",
        url: uriTargetData,
        headers: {
          Authorization: "Bearer " + BearerToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        maxBodyLength: Infinity,
      };

      const result = await ExecuteTargetDataAPI(config);

      response = result;

      //END GET PROFILE
    } else {
      //OTHER TARGET_DATA
      if (payload_data.parameters) {
        let param = "";
        if (module_ispath === 1) {
          Object.values(payload_data.parameters).map((v) => {
            param += v;
          });
        } else {
          let n = 0;
          Object.keys(payload_data.parameters).map((k, v, index) => {
            param +=
              k +
              "=" +
              v +
              (n < Object.keys(payload_data.parameters).length - 1 ? "&" : "");
            n++;
          });
        }
        // Pola regex untuk mencari kecocokan dalam format {{...}}
        const regexPattern = /{{(.*?)}}/g;
        // Mengganti uri {{ param }} menjadi data value
        const urlDataReplace = current_path_uri.replace(
          regexPattern,
          (match, group) => {
            return match.replace(match, param);
          }
        );
        const uriTargetData = await GetBaseURLAPI(
          app_env,
          UserID,
          urlDataReplace
        );

        //request to jaguar api
        const config = {
          method: module_type,
          url: uriTargetData,
          headers: {
            Authorization: "Bearer " + BearerToken,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          maxBodyLength: Infinity,
        };
        const result = await ExecuteTargetDataAPI(config);
        //end request to jaguar api

        response = result;
      } else if (!module_parameters && !payload_data.parameters) {
        //JIKA TIDAK MEMILIKI PARAMETERS
        const uriTargetData = await GetBaseURLAPI(
          app_env,
          UserID,
          current_path_uri
        );

        //request to jaguar api
        const config = {
          method: module_type,
          url: uriTargetData,
          headers: {
            Authorization: "Bearer " + BearerToken,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          maxBodyLength: Infinity,
        };
        const result = await ExecuteTargetDataAPI(config);
        //end request to jaguar api

        response = result;
        //END
      } else {
        let results = await FindAnErrorMessage("04005");
        response = {
          message: results,
          result: "error",
        };
      }
      //END OTH TARGET_DATA
    }
  } else {
    //method POST
    if (payload_data.parameters) {
      const uriTargetData = await GetBaseURLAPI(
        app_env,
        UserID,
        current_path_uri
      );
      //request to jaguar api
      const config = {
        method: module_type,
        url: uriTargetData,
        headers: {
          Authorization: "Bearer " + BearerToken,
          "Content-Type": "application/json",
        },
        maxBodyLength: Infinity,
        data: JSON.stringify(payload_data.parameters),
      };
      const result = await ExecuteTargetDataAPI(config);
      //end request to jaguar api

      response = result;
    } else {
      let results = await FindAnErrorMessage("04005");
      response = {
        message: results,
        result: "error",
      };
    }
  }

  return response;
};

const SignaturePayload = (data, secret_key, app_signature, app_timestamp) => {
  var trimmed_payload = data.replace(/\s+/g, "");
  var base64 = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(trimmed_payload)
  );
  var signature_raw = app_timestamp + "|<->|" + base64;
  var signature_bytes = CryptoJS.HmacSHA256(signature_raw, secret_key);
  var signature = CryptoJS.enc.Base64.stringify(signature_bytes);

  if (signature === app_signature) {
    return true;
  } else {
    return false;
  }
};

const GetURIGetProfile = async (target_data, current_user, app_env) => {
  let results = "";
  let uri_target_data = "";
  const conditions = { Name: target_data };
  const get_module_target_data = await FindAnTargetData(conditions);
  if (get_module_target_data) {
    const path_target = await FindSystemParam(
      "prefik-api",
      get_module_target_data.Prefik
    );
    uri_target_data = path_target ? path_target.Value : "";
    uri_target_data += get_module_target_data.Url;
  }

  if (uri_target_data) {
    //decode id_token to get id user
    const token_id_arr = current_user.id_token.split(/\./);
    const token_id = token_id_arr[1];
    const decode_token_id = atob(token_id);
    const obj_token_user = JSON.parse(decode_token_id);
    const entityID = obj_token_user.empID
      ? obj_token_user.empID
      : obj_token_user.sub;
    const email_user = obj_token_user.email ? obj_token_user.email : "";
    //end decode

    // Pola regex untuk mencari kecocokan dalam format {{...}}
    const regexPattern = /{{(.*?)}}/g;
    // Mengganti uri {{ param }} menjadi data value
    const urlDataReplace = uri_target_data.replace(
      regexPattern,
      (match, group) => {
        return match.replace(match, entityID);
      }
    );
    uri_target_data = urlDataReplace;

    //Get Base URL
    results = await GetBaseURLAPI(app_env, current_user.UserID, uri_target_data);
    //end base URL
  }

  return results;
};

const GetBaseURLAPI = async (app_env, email_user, path) => {
  let results = "";
  const conditions = { Name: app_env, IsMain: 1 };
  const GetAppBaseUrl = await FindConsumerKey(conditions);
  if (GetAppBaseUrl) {
    const get_port_app = await FindSystemParam("port", "req-module");
    const get_url = await FindSystemParam("base_uri", GetAppBaseUrl.Type);
    const uriport =
      get_port_app && get_url ? get_url.Value + ":" + get_port_app.Value : "";

    const mailArr = email_user.split("@");
    const mailUser = mailArr[mailArr.length - 1];
    results = uriport + "/t/" + mailUser + path;
  }

  return results;
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

const FindAnTargetData = async (conditions) => {
  let results = [];
  try {
    const result = await GlobalTargetData.findOne({
      where: conditions,
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

const FindConsumerKey = async (conditions) => {
  let results = [];
  try {
    const result = await ConsumerKeyAccount.findOne({
      where: conditions,
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

const FindAccountSession = async (app_id, app_env) => {
  let results = [];
  try {
    const result = await SessionUserAccount.findOne({
      where: {
        App_ID: app_id,
        AppEnvironment: app_env,
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

const ExecuteTargetDataAPI = async (config) => {
  let results = [];

  let responses = await axios(config)
    .then(function (response) {
      console.log(response);
      results = response.data;
      return results;
    })
    .catch(function (e) {
      results = {
        message: {
          internal: e.response.data.error_description
            ? e.response.data.error_description
            : e.response.data.detail,
          user: e.response.data.error_description
            ? e.response.data.error_description
            : e.response.data.detail,
        },
        result: "error",
      };
      return results;
    });

  return responses;
};

const PostLog2Rabbit = async (headers, param, response) => {
  const moment = require("moment");
  const isOpenDebug = await FindSystemParam("open-debug", headers["app-env"]);
  if (isOpenDebug) {
    if (isOpenDebug.Value === "true") {
      const conditions = { Name: "post-log", Description: "production" };
      const GetURIRabbit = await FindConsumerKey(conditions);
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

        const amqp = require("amqplib/callback_api");
        const configAcc = {
          hostname: GetURIRabbit.URL,
          port: parseInt(GetURIRabbit.Port),
          username: rabbit_account.name,
          password: rabbit_account.password,
          vhost: "log",
        };
        await amqp.connect(configAcc, function (error0, connection) {
          if (error0) {
            throw error0;
          }
          connection.createChannel(function (error1, channel) {
            if (error1) {
              throw error1;
            }

            channel.assertExchange(exchange, "direct", { durable: true });
            channel.publish(
              exchange,
              routing,
              Buffer.from(JSON.stringify(paramLog))
            );
          });

          setTimeout(function () {
            connection.close();
            //process.exit(0);
          }, 500);
        });
      }
    }
  }
};
