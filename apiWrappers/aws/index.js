'use strict';

const AwsSdk = require('aws-sdk');
const S3 = require('./S3');
const SES = require('./SES');
const SNS = require('./SNS');

const config = global.Config.aws || {};

AwsSdk.config.update({
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
    region: config.region,
    correctClockSkew: true
});

module.exports = {
    S3: new S3(config),
    SES: new SES({
        ...config,
        email: global.Config.email
    }),
    SNS
};
