'use strict';

const AwsSdk = require('aws-sdk');

module.exports = class SNS {
    constructor(config) {
        if (!config.sns) {
            return;
        }
        this.config = config.sns;
        // AwsSdk.config.update({region: config.sns.region});
        this.snsInstance = new AwsSdk.SNS({
            apiVersion: '2010-03-31',
            region: config.region
        });
    }

    publishText(msg, logger) {
        let loggerInstance = logger.child({ startTime: process.hrtime() });
        const params = {
            Message: typeof msg === 'string' ? msg : JSON.stringify(msg),
            TopicArn: this.config.topicArn
        };
        const publishTextPromise = this.snsInstance.publish(params).promise();
        return publishTextPromise
            .then((data) => {
                loggerInstance.info("MessageID is " + data.MessageId);
                return data.MessageId;
            });
    }
};
