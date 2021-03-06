'use strict';


const Q = require('q');
const sgMail = require('@sendgrid/mail');

const MAX_RETRIES = 3;
var path = require('path');
var fs = require('fs');
var ejs = require('ejs');
// var logger = require('./../../logger/logger-service');
// var errorLog = logger('error');


module.exports = class SendGrid {
    constructor(sendGrid) {
        sgMail.setApiKey(sendGrid);
        this.TEMPLATE_PATH = path.resolve('./mail'); // TODO Test this path
        this.readFile = Q.denodeify(fs.readFile);
    }



    /**
     * sendMailFromTemplate
     *
     * Sends an email based on an HTML template and stylesheet located in the
     * /mail directory at the root of the project.
     */
    sendMailFromTemplate(to, from, subject, messageParams, template, logger) {
        var self = this;
        var defer = Q.defer();
        Q.try(function() {
            var style = self.TEMPLATE_PATH + '/style.json';
            var templatePath = self.TEMPLATE_PATH + '/' + template + '.ejs';
            return [ self.readFile(style), self.readFile(templatePath) ];
        }).spread(function(style, template) {
            style = JSON.parse(style);
            template = template.toString();
            var data = { 'style': style, 'params': messageParams };
            var html = ejs.render(template, data);
            to = to.constructor === Array ? to.join(',') : to;
            return self.sendMail({to, from, subject, html}, logger);
        }).then(function(result) {
            defer.resolve(result);
        }).catch(function(err) {
            // errorLog.write({ title: 'Error in MailService sendMailFromTemplate', error: err });
            console.log({ title: 'Error in MailService sendMailFromTemplate', error: err });
            defer.reject(err);
        });

        return defer.promise;
    }

    /*
    TODO: add validations to mail options
     */
    sendEmail(mailOptions, logger) {
        if (!mailOptions.from) {
            mailOptions.from = global.Config.email.defaultFrom
        }

        let loggerInstance = logger.child({startTime: process.hrtime()});
        return sgMail.send(mailOptions)
            .then(info => {
                loggerInstance.info({responseTime: process.hrtime(loggerInstance.fields.startTime)}, 'mail sent');
                return info;
            })
            .catch(error => {
                mailOptions.attachments && delete mailOptions.attachments;
                loggerInstance.info(mailOptions);
                loggerInstance.error({err: error, responseTime: process.hrtime(loggerInstance.fields.startTime)}, 'Error sending email');
                throw error;
            });
    }
};
