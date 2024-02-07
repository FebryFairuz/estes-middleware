const { QueryTypes } = require("sequelize");
const CryptoJS = require("crypto-js");
const axios = require('axios');
const { Sequelize, sequelize, SystemParam, GlobalTargetData, GlobalErrorMessage, ConsumerKeyAccount, SessionUserAccount } = require("../models");

exports.authentication = async (req, res) => {
    const headers = req.headers;
    const APP_ID = headers['app-id'];
    const APP_ENV = headers['app-env'];
    
    const reqdata = req.body;
    

    if((APP_ID && APP_ID.length <= 36) && APP_ENV){
        if(reqdata['username'] && reqdata['password']){
            reqdata['typeCK'] = reqdata['typeCK'] ? reqdata['typeCK'] : "production";
            //Get Public Key
            const sys_param = await FindSystemParam("private-key",APP_ENV);
            const public_key = sys_param ? sys_param.Value : "";
            //End Get Public Key

            //decrypt password
            const decryptPass = CryptoJSAesJson.decrypt(JSON.stringify(reqdata['password']),public_key);
            //end decrypt

            //get consumer key
            const get_consumer_key = await FindConsumerKey(APP_ENV,reqdata['typeCK'],1);
            const consumer_key_acc = get_consumer_key ? JSON.parse(get_consumer_key.Account) : "";
            //end consumer key

            //find role of user by email
            let role_user = {name:"", id:0, consumer_key:""};
            if(consumer_key_acc){
                if(reqdata['username'].includes("@sgu")){
                    role_user = {name:"Staff", id:3, consumer_key:consumer_key_acc.key.staff};
                }else if(reqdata['username'].includes("@student")){
                    role_user = {name:"Student", id:1, consumer_key:consumer_key_acc.key.student};
                }else if(reqdata['username'].includes("@lecturer")){
                    role_user = {name:"Lecturer", id:2, consumer_key:consumer_key_acc.key.lecturer};
                }else{
                    role_user = {name:"Guest", id:4, consumer_key:""};
                }
            }
            //end of find role user

            if(role_user.consumer_key){
                //Get Base URI
                let uriAPI = await GetBaseURIAPI(get_consumer_key, "login", reqdata['username']);
                //End  Get Base URI

                //Check account is already login by this app-env
                const isExistingUser = await FindAccountSession(APP_ID, APP_ENV, reqdata['username']);
                
                if(isExistingUser){
                    const delete_user = await SessionUserAccount.destroy({ where: { UserID: reqdata['username'], AppEnvironment:APP_ENV } });
                }

                //access to api jaguar to get a new token
                    const qs = require('qs');
                    let param = qs.stringify({
                        'username': reqdata['username'],
                        'grant_type': 'password',
                        'scope': 'openid',
                        'password': decryptPass 
                    });
                    const consumer_key_arr = role_user.consumer_key.split("Authorization:");
                    const consumer_key_user = consumer_key_arr[consumer_key_arr.length - 1];
                    const headers = {
                        'Content-Type' : 'application/x-www-form-urlencoded',
                        'Authorization': consumer_key_user
                    }
                    let GetToken = await ExecuteLoginAPI(param, uriAPI, headers)
                    if(GetToken){
                        console.log("token:",GetToken);
                        //decode token_id for get the user info
                        //let token_id_arr = GetToken.id_token.split(/\./);
                        //console.log(token_id_arr);
                        //end decode token_id
                        //insert to db
                        let identity_user = {

                        }

                        //create identity
                    }else{
                        let results = await FindAnErrorMessage("01003");
                        res.json({
                            status: 200,
                            message: results,
                            results:"error"
                        }); 
                    }
                //end access api

                //End check existing account

                res.json({
                    status: 200,
                    data: GetToken,
                    results:"success"
                });    
            }else{
                let results = await FindAnErrorMessage("03008");
                res.json({
                    status: 200,
                    message: results,
                    results:"error"
                });    
            }
        }else{
            let results = await FindAnErrorMessage("04006");
            res.json({
                status: 200,
                message: results,
                results:"error"
            });    
        }
    }else{
        let results = await FindAnErrorMessage("03004");
        res.json({
            status: 200,
            message: results,
            results:"error"
        });
    }
};

const APICMDExecute = () =>{

}

const FindAnErrorMessage = async (code) =>{
    let results =[];
    try {
        const result = await GlobalErrorMessage.findOne({
            where: {
                ErrorCode: code,
            },
        }); 
        const msgError = {internal:result.Description, user:result.DescriptionUser};
        results = msgError;
    } catch (error) {
        const msgError = {internal:"Failed retrive, "+error, user:"Failed retrive data:"+error};
        results = msgError;
    }
    
    return results;
}

const FindSystemParam = async (tipe, name) =>{
    let results =[];
    try {
        const result = await SystemParam.findOne({
            where: {
                Tipe: tipe,
                Name: name
            },
        }); 
        results = result;
    } catch (error) {
        const msgError = {internal:"Failed retrive, "+error, user:"Failed retrive data:"+error};
        results = msgError;
    }
    
    return results;
}

const FindConsumerKey = async (name, type, IsMain) =>{
    let results =[];
    try {
        const result = await ConsumerKeyAccount.findOne({
            where: {
                Description: type,
                Name: name,
                IsMain:IsMain
            },
        }); 
        results = result;
    } catch (error) {
        const msgError = {internal:"Failed retrive, "+error, user:"Failed retrive data:"+error};
        results = msgError;
    }
    
    return results;
}

const FindAccountSession = async (app_id, app_env, email) =>{
    let results =[];
    try {
        const result = await SessionUserAccount.findOne({
            where: {
                [Sequelize.Op.or]: [
                    { [Sequelize.Op.and]: [{ App_ID: app_id }, { AppEnvironment: app_env }] },
                    { [Sequelize.Op.and]: [{ UserID: email }, { AppEnvironment: app_env }] },
                ],
            },
        }); 
        results = result;
    } catch (error) {
        const msgError = {internal:"Failed retrive, "+error, user:"Failed retrive data:"+error};
        results = msgError;
    }
    
    return results;
}

const ExecuteLoginAPI = async (data, uri, headers) =>{
    let results = [];
    
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: uri,
        headers,
        data : data
    };
    let responses = await axios(config)
    .then(function (response) {
        results = response.data;
        return results;
    })
    .catch(function (e) {
        var message = "Error fetch data from Middleware.";
        results = {"error":message}
        return results;
    })

    return responses;
}

const GetBaseURIAPI = async (config, tipe, mail) =>{
    const getPort = await FindSystemParam("port", tipe);
    const getURL =  await FindSystemParam("base_uri", config.Type);
    let uriAPI = "";
    if(getPort && getURL){
        uriAPI = getURL.Value + ":"+getPort.Value;
    }
    if(tipe === "login"){
        const getPath = await FindSystemParam("token_path", config.Type);
        uriAPI = uriAPI + (getPath ? getPath.Value : "");
    }else if(tipe === "req-module"){
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