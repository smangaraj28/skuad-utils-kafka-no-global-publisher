'use strict';

const AuthMiddleware = {};
module.exports = AuthMiddleware;

const ipRangeCheck = require('ip-range-check');
const SES = require('../apiWrappers/aws').SES;
const { UnAuthorisedError } = require('../util/errors');
const { env } = global.Config;

AuthMiddleware.isAuthorizedIP = function(allowedIps) {
    return function (req, res, next) {
        const ipAddress = req.headers && req.headers['x-forwarded-for'];

        if (['staging', 'production'].indexOf(env) !== -1 && (!ipAddress || !ipRangeCheck(ipAddress, allowedIps))) {
            SES.sendEmail({
                to: (global.Config.email && global.Config.email.defaultTo) || `ak+${global.Config.env}@skuad.io`,
                subject: `Unauthorized access from IP : ${env}`,
                text: `Unauthorized access from IP ${ipAddress}
                headers - ${JSON.stringify(req.headers)}
                uri - ${req.url}`
            }, null, req.logger);
            throw new UnAuthorisedError('Request not allowed');
        }

        return next();
    }
};

AuthMiddleware.decodeUserObject = () => {
    return function (req, res, next) {
        if(req.headers['authorization']) {
            let data = req.headers['authorization'].split('.')[1];
            let buff = Buffer.from(data, 'base64');
            let text = buff.toString('utf8');
            req.user = JSON.parse(text);
            if (!req.user || !req.user.user_id) throw new UnAuthorisedError('Request not allowed');
            req.user.role = req.user.roles && req.user.roles.length && req.user.roles[0];
            req.user.token = req.headers['authorization'];
        }
        next();
    }
};
