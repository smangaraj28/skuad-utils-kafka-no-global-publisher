'use strict';


const Q = require('q');
const AwsSdk = require('aws-sdk');
const NodeMailer = require('nodemailer');

const MAX_RETRIES = 3;

module.exports = class SES {
    constructor(config) {
        if (!config.ses) {
            return;
        }
        this.config = config;
        this.sesInstance = new AwsSdk.SES({
            region: config.ses.region
        });

        this.sesTransporter = NodeMailer.createTransport({
            SES: this.sesInstance,
            sendingRate: 10
        });

        this.gmailTransporter = NodeMailer.createTransport({
            service: 'gmail',
            auth: config.email.gmail
        });
    }

    /*
    TODO: add validations to mail options
     */
    sendEmail(mailOptions, service = '', logger) {
        let deferred = Q.defer();

        if (!mailOptions.from) {
            mailOptions.from = global.Config.email.defaultFrom
        }

        let loggerInstance = logger.child({startTime: process.hrtime()});
        let transporter = service === 'gmail' ? this.gmailTransporter : this.sesTransporter;

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {loggerInstance.error({err: error, responseTime: process.hrtime(loggerInstance.fields.startTime)}, 'Error sending email');
                deferred.reject(error);
            } else {
                loggerInstance.info({responseTime: process.hrtime(loggerInstance.fields.startTime)}, 'mail sent');
                deferred.resolve(info);
            }
        });

        return deferred.promise;
    }
};
