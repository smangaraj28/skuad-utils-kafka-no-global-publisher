const Q = require('q');
const Zenziva = require('zenziva-sms');

const PROVIDER = 'zenziva';

module.exports = class ZENZIVA {
    constructor(config) {
        this.config = config;
        this.zenzivaInstance = new Zenziva(config.userkey, config.passkey);
    }

    sendSms(numberPhone, message, logger) {
        const deferred = Q.defer();

        if (!['production'].includes(global.Config.env)
            && global.Config.dummyPhoneNumbers.indexOf(numberPhone) === -1) {
            logger.info('Cannot send test sms');
            deferred.resolve();
        } else {
            this.zenzivaInstance.masking(numberPhone, message)
                .then((result) => {
                    if (logger) {
                        /*
                        TODO: Add check on status returned in result.data
                         */
                        logger.info({
                            status: result.status,
                            data: result.data,
                            provider: PROVIDER,
                            message
                        }, 'message sent');
                    }
                    deferred.resolve(result);
                })
                .catch((error) => {
                    if (logger) {
                        logger.error(error, 'error sending sms');
                    }
                    deferred.reject(error);
                });
        }
        return deferred.promise;
    }
};
