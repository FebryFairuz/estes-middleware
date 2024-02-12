const { QueryTypes } = require("sequelize");
const CryptoJS = require("crypto-js");
const axios = require('axios');
const { Sequelize, sequelize, SystemParam, GlobalTargetData, GlobalErrorMessage, ConsumerKeyAccount, SessionUserAccount } = require("../models");
const { response } = require("express");

exports.requestModule = async (req, res) => {
    const headers = req.headers;
    const APP_ID = headers['app-id'];
    const APP_ENV = headers['app-env'];
    const APP_TIMESTAMP = headers['app-timestamp'];
    const APP_SIGNATURE = headers['app-signature'];
    
    const reqdata = req.body;

    let response;

    if ((APP_ID && APP_ID.length <= 36) && APP_ENV) {
        if (reqdata){
            if(reqdata['target_data']){
                //get bearer token user
                const isExistingUser = await FindAccountSession(APP_ID, APP_ENV);
                if (isExistingUser) {
                    //hamming payload
                    const isSameSignature = SignaturePayload(JSON.stringify(reqdata), isExistingUser.SecretKey, APP_SIGNATURE, APP_TIMESTAMP);
                    if(isSameSignature){
                        //request target data to api jaguar
                        const conditions = {Name: reqdata['target_data']};
                        const isExistTargetData = await FindAnTargetData(conditions);
                        if(isExistTargetData){
                            const result = await GenerateRequestModule(isExistTargetData, reqdata, isExistingUser, APP_ENV);
                            response = {
                                response:result,
                                results:"success"
                            }
                        }else{
                            let results = await FindAnErrorMessage("02005");
                            response = {
                                message: results,
                                results: "error"
                            };
                        }
                        //end request
                    }else{
                        let results = await FindAnErrorMessage("03006");
                        response = {
                            message: results,
                            results: "error"
                        };
                    }
                    //end hamming payload      
                }
            }else{
                let results = await FindAnErrorMessage("04006");
                response = {
                    message: results,
                    results: "error"
                };
            }
        }else{
            let results = await FindAnErrorMessage("04004");
            response = {
                message: results,
                results: "error"
            };
        }

    } else {
        let results = await FindAnErrorMessage("03004");
        response = {
            message: results,
            results: "error"
        };
    }

    res.status(200).json(response);

    const PostLog = await PostLog2Rabbit(headers, reqdata, response);
};

const GenerateRequestModule = async (target_data,payload_data, current_user, app_env) =>{
    const module_type = target_data.Type;
    const module_uri = target_data.Url;
    const BearerToken = current_user.BearerToken;
    const UserID = current_user.UserID;
    let dataPost = {};
    let base_url_target_data = "";

    if(module_type === "GET"){
        if(payload_data.target_data === "GET_PROFILE"){
            let target_data_selected = "";
            if (UserID.includes("@sgu")) {
                target_data_selected = "GET_EMP_BIO_BY_IDENID";
            } else if (UserID.includes("@student")) {
                target_data_selected = "GET_STUDENT_DATA_M";
            } else if (UserID.includes("@lecturer")) {
                target_data_selected = "GET_EMP_BIO_BY_IDENID";
            }
            const uriTargetData = await GetURITargetData(target_data_selected, current_user, app_env);
            console.log("urinya:",uriTargetData);
        }else{
            console.log("bukan itu");
        }        
    }else{
        base_url_target_data = module_uri;
        dataPost['POSTFIELDS']
    }
    

}

const SignaturePayload = (data, secret_key, app_signature, app_timestamp) =>{
    var trimmed_payload = data.replace(/\s+/g, '');
    var base64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(trimmed_payload));
    var signature_raw = app_timestamp + '|<->|' + base64;
    var signature_bytes = CryptoJS.HmacSHA256(signature_raw,secret_key);
    var signature = CryptoJS.enc.Base64.stringify(signature_bytes);

    if(signature === app_signature){
        return true;
    }else{
        return false;   
    }
}

const GetURITargetData = async (target_data, current_user, app_env) =>{
    let results = ""; let uri_target_data = "";
    const conditions = {Name: target_data};
    const get_module_target_data = await FindAnTargetData(conditions);
    if(get_module_target_data){
        const path_target = await FindSystemParam("prefik-api",get_module_target_data.Prefik);
        uri_target_data = (path_target) ? path_target.Value : "";
        uri_target_data += get_module_target_data.Url;
    }

    if(uri_target_data){
        //decode id_token to get id user
        const token_id_arr = current_user.id_token.split(/\./);
        const token_id = token_id_arr[1];
        const decode_token_id = atob(token_id);
        const obj_token_user = JSON.parse(decode_token_id);
        const entityID = (obj_token_user.empID) ? obj_token_user.empID : obj_token_user.sub;
        const email_user = (obj_token_user.email) ? obj_token_user.email : "";
        //end decode

        // Pola regex untuk mencari kecocokan dalam format {{...}}
        const regexPattern = /{{(.*?)}}/g;
        // Mencocokkan dan mengganti nilai di URIAPIProfile
        const urlDataReplace = uri_target_data.replace(regexPattern, (match, group) => {
            return match.replace(match, entityID);
        });
        uri_target_data = urlDataReplace;

        //Get Base URL
        const conditions = {Name:app_env,IsMain:1};
        const GetAppBaseUrl = await FindConsumerKey(conditions);
        if(GetAppBaseUrl){
            
            const get_port_app = await FindSystemParam("port", "req-module");
            const get_url = await FindSystemParam("base_uri", GetAppBaseUrl.Type);
            const uriport = ((get_port_app && get_url) ? get_url.Value + ":" + get_port_app.Value : '');
            
            const mailArr = email_user.split('@');
            const mailUser = mailArr[mailArr.length - 1];
            results = uriport + "/t/" + mailUser + uri_target_data;
        }   
        //end base URL
    }

    return results;
}

const FindAnErrorMessage = async (code) => {
    let results = [];
    try {
        const result = await GlobalErrorMessage.findOne({
            where: {
                ErrorCode: code,
            },
        });
        const msgError = { internal: result.Description, user: result.DescriptionUser };
        results = msgError;
    } catch (error) {
        const msgError = { internal: "Failed retrive, " + error, user: "Failed retrive data:" + error };
        results = msgError;
    }

    return results;
}

const FindAnTargetData = async (conditions) => {
    let results = [];
    try {
        const result = await GlobalTargetData.findOne({
            where: conditions,
        });
        results = result;
    } catch (error) {
        const msgError = { internal: "Failed retrive, " + error, user: "Failed retrive data:" + error };
        results = msgError;
    }

    return results;
}

const FindSystemParam = async (tipe, name) => {
    let results = [];
    try {
        const result = await SystemParam.findOne({
            where: {
                Tipe: tipe,
                Name: name
            },
        });
        results = result;
    } catch (error) {
        const msgError = { internal: "Failed retrive, " + error, user: "Failed retrive data:" + error };
        results = msgError;
    }

    return results;
}

const FindConsumerKey = async (conditions) => {
    let results = [];
    try {
        const result = await ConsumerKeyAccount.findOne({
            where: conditions,
        });
        results = result;
    } catch (error) {
        const msgError = { internal: "Failed retrive, " + error, user: "Failed retrive data:" + error };
        results = msgError;
    }

    return results;
}

const FindAccountSession = async (app_id, app_env) => {
    let results = [];
    try {
        const result = await SessionUserAccount.findOne({
            where:{
                App_ID:app_id,
                AppEnvironment:app_env
            }
        })
        results = result;
    } catch (error) {
        const msgError = { internal: "Failed retrive, " + error, user: "Failed retrive data:" + error };
        results = msgError;
    }

    return results;
}

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
        let mailArr = mail.split('@');
        mailUser = mailArr[mailArr.length - 1];
        uriAPI = uriAPI + "/t/" + mailUser;
    }
    return uriAPI;
}

var CryptoJSAesJson = {
    'encrypt': function (value, password) {
        return CryptoJS.AES.encrypt(JSON.stringify(value), password, { format: CryptoJSAesJson }).toString()
    },

    'decrypt': function (jsonStr, password) {
        return JSON.parse(CryptoJS.AES.decrypt(jsonStr, password, { format: CryptoJSAesJson }).toString(CryptoJS.enc.Utf8))
    },

    'stringify': function (cipherParams) {
        var j = { ct: cipherParams.ciphertext.toString(CryptoJS.enc.Base64) }
        if (cipherParams.iv) j.iv = cipherParams.iv.toString()
        if (cipherParams.salt) j.s = cipherParams.salt.toString()
        return JSON.stringify(j).replace(/\s/g, '')
    },

    'parse': function (jsonStr) {
        var j = JSON.parse(jsonStr)
        var cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(j.ct) })
        if (j.iv) cipherParams.iv = CryptoJS.enc.Hex.parse(j.iv)
        if (j.s) cipherParams.salt = CryptoJS.enc.Hex.parse(j.s)
        return cipherParams
    }
}

const PostLog2Rabbit = async (headers, param, response) => {
    const moment = require('moment');
    const isOpenDebug = await FindSystemParam('open-debug', headers['app-env']);
    if (isOpenDebug) {
        if (isOpenDebug.Value === "true") {
            const conditions = {Name:'post-log', Description:"production"};
            const GetURIRabbit = await FindConsumerKey(conditions);
            if (GetURIRabbit) {
                const rabbit_account = JSON.parse(GetURIRabbit.Account);
                const paramLog = {
                    origin: "middleware",
                    user: param['username'],
                    code: 506,
                    service: "Login",
                    response: response,
                    type: "",
                    transid: "",
                    param: param,
                    request_app_id: headers['app-id'],
                    request_app: headers['app-env'],
                    created: moment().format("YYYY-MM-DD HH:mm:ss"),
                }
                const exchange = "msa.direct.log";
                const routing = "request";

                const amqp = require('amqplib/callback_api');
                const configAcc = {
                    hostname: GetURIRabbit.URL,
                    port: parseInt(GetURIRabbit.Port),
                    username: rabbit_account.name,
                    password: rabbit_account.password,
                    vhost:"log"
                }
                await amqp.connect(configAcc, function (error0, connection) {
                    if (error0) {
                        throw error0;
                    }
                    connection.createChannel(function (error1, channel) {
                        if (error1) {
                            throw error1;
                        }

                        channel.assertExchange(exchange, 'direct', { durable: true });
                        channel.publish(exchange, routing, Buffer.from(JSON.stringify(paramLog)));
                    });

                    setTimeout(function () {
                        connection.close();
                        //process.exit(0);
                    }, 500);
                });
            }

        }
    }
}