/* eslint-disable no-param-reassign */
/*
 * create by akul on 2020-05-16
*/
const request = require('request');
const Q = require('q');
const crypto = require('crypto');
const CustomError = require('../../util/errors/CustomError');

let MIDTRANS_API_BASE = 'https://api.sandbox.midtrans.com/v2';
if (global.Config.env === 'production') {
    MIDTRANS_API_BASE = 'https://api.midtrans.com/v2';
}
let SNAP_API_BASE = 'https://app.sandbox.midtrans.com/snap/v1';
if (global.Config.env === 'production') {
    SNAP_API_BASE = 'https://app.midtrans.com/snap/v1';
}

const API_KEY = global.Config.midtrans && global.Config.midtrans.server_key;

// eslint-disable-next-line new-cap
const AUTH_STRING = new Buffer.from(`${API_KEY}:`).toString('base64');
const AUTHORIZATION = `Basic ${AUTH_STRING}`;
const { ZENIUS_API_URL, ZENIUS_CALLBACK_URI } = global.Config;

function gopayRequest(config, logger) {
    const deferred = Q.defer();

    request(config, (err, response, body) => {
        if (err) {
            logger.error(err, 'gopay response');
            deferred.reject(err);
        } else if (response.statusCode === 201 || response.statusCode === 200) {
            logger.info(body, 'gopay response');
            deferred.resolve(body);
        } else {
            logger.error(body, 'gopay response');
            deferred.reject(body);
        }
    });

    return deferred.promise;
}

function makeRequest(config = {}, logger) {
    // time of initiating the gopay request
    const startTime = process.hrtime();

    const deferred = Q.defer();

    if (!config.baseUrl) config.baseUrl = MIDTRANS_API_BASE;

    config.headers['Content-Type'] = 'application/json';
    config.headers.Accept = 'application/json';
    config.headers.Authorization = AUTHORIZATION;
    config.headers['X-Override-Notification'] = `${ZENIUS_API_URL}${ZENIUS_CALLBACK_URI ? ZENIUS_CALLBACK_URI : '/v1/midtrans/notification/callback'}`;

    logger.info(config, 'gopay request');

    gopayRequest(config, logger)
        .then(deferred.resolve)
        .catch((error) => {
            logger.error(error, 'gopay error');
            gopayRequest(config, logger)
                .then(deferred.resolve)
                .catch((err) => {
                    logger.error(err, 'gopay error');
                    deferred.reject(err);
                });
        }).finally(() => {
        logger.info({
            third_party: 'GOPAY',
            responseTime: process.hrtime(startTime)[0] * 1000 + process.hrtime(startTime)[1] / 1000000,
        }, '[THIRD_PARTY_CALL] api call completed');
    });

    return deferred.promise;
}

const PAYMENT_METHOD_MAP = Object.freeze({
    "midtrans-go-pay": ["gopay"],
    "midtrans-virtual-account": ["echannel", "permata_va", "other_va", "bni_va", "bca_va"],
    "midtrans-alfamart": ["alfamart"],
    "midtrans-indomaret": ["indomaret"],
    "midtrans-akulaku": ["akulaku"],
    "midtrans-credit-card": ["credit_card"],
    "":["gopay","echannel", "permata_va", "other_va", "bni_va", "bca_va", "alfamart", "indomaret", "akulaku", "credit_card"]
});

class Gopay {
    constructor(props) {
        if (!props.logger) {
            throw new Error('logger is required');
        }
        this.logger = props.logger;
        if (!API_KEY) {
            throw new Error('MIDTRANS API_KEY not present');
        }
    }

    getGopaySnapToken(data) {
        const deferred = Q.defer();

        makeRequest({
            baseUrl: SNAP_API_BASE,
            uri: '/transactions',
            json: data,
            headers: {},
            method: 'POST',
        }, this.logger)
            .then(deferred.resolve)
            .catch((error) => deferred.reject(error));

        return deferred.promise;
    }

    async getGopayStatus(order_id) {
        const statusResp = await makeRequest({
            uri: `${order_id}/status`,
            headers: {},
            method: 'GET',
        }, this.logger);
        try {
            return typeof statusResp === 'string' ? JSON.parse(statusResp) : statusResp;
        } catch (e) {
            return statusResp;
        }
    }

    padNumber(num, count, padCharacter) {
        if (typeof padCharacter == "undefined") {
            padCharacter = "0";
        }
        var lenDiff = count - String(num).length;
        var padding = "";

        if (lenDiff > 0)
            while (lenDiff--)
                padding += padCharacter;

        return padding + num;
    }

    formatToGopayDatetime(time) {
        // 'YYYY-MM-DD HH:mm:ss Z'
        const d = new Date(time);
        return `${d.getUTCFullYear()}-${this.padNumber((d.getUTCMonth() + 1 ), 2)}-${this.padNumber(d.getUTCDate(), 2)} ${this.padNumber(d.getUTCHours(), 2)}:${this.padNumber(d.getUTCMinutes(), 2)}:${this.padNumber(d.getUTCSeconds(), 2)} Z`
    }

    getPaymentsFromTransaction(transaction) {
        if (!transaction) throw new CustomError('Transaction is required for Midtrans payment', 422);
        const enabled_method = PAYMENT_METHOD_MAP[transaction.channel];
        if (!enabled_method) throw new CustomError('Transaction method not supported by Midtrans', 422);
        return enabled_method;
    }

    generateSnapToken(prefix, order, user, transaction, callbackUrl, time, tokenExpiry) {

        let transaction_details = {
            order_id: `${prefix}-${order.id}`,
            gross_amount: transaction.amount,

        };
        let expiry = {
            start_time: this.formatToGopayDatetime(time),
            unit:'minutes',
            duration:tokenExpiry
        };
        let customer_details = {
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            phone: user.phone
        };
        let gopayRequestPayload = {
            transaction_details,
            customer_details,
            expiry,
            credit_card: {
                secure: true,
            },
            enabled_payments: this.getPaymentsFromTransaction(transaction),
            custom_field1: `user:${order.user_id}`,
            custom_field2: `order:${order.id}`,
            custom_field3: `transaction:${transaction.id}`
        };

        return this.getGopaySnapToken(gopayRequestPayload)
    }

    generateGopayInvoice(prefix, order, callbackUrl, time, tokenExpiry) {
        let transactionDetails, gopay, expiry;
        let gopayRequestPayload = {};

        transactionDetails = {
            order_id: `${prefix}-${order.id}`,
            gross_amount: order.sub_total,

        };

        gopay = {
            enable_callback:true,
            callback_url:callbackUrl
        };

        expiry = {
            start_time: this.formatToGopayDatetime(time),
            unit:'minutes',
            duration:tokenExpiry
        };
        gopayRequestPayload.transaction_details = transactionDetails;
        gopayRequestPayload.gopay = gopay;
        gopayRequestPayload.expiry = expiry;
        gopayRequestPayload.payment_type = 'gopay';

        return this.getGopaySnapToken(gopayRequestPayload)
    }


    validateNotificationSignature({order_id, status_code, gross_amount, signature_key}) {
        const hash = crypto.createHash('sha512');
        hash.update(order_id+status_code+gross_amount+API_KEY);
        return hash.digest('hex') === signature_key;
    }

    topupGopayStore(prefix, order, store) {
        let gopayRequestPayload = {};

        gopayRequestPayload.transaction_details = {
            order_id: `${prefix}-${order.id}`,
            gross_amount: order.amount,

        };
        gopayRequestPayload.cstore = {
            store: store,
            message:"store transaction"
        };
        gopayRequestPayload.payment_type = 'cstore';

        return this.getGopaySnapToken(gopayRequestPayload)
    }

    topupGopayBank(prefix, order, bank) {
        let transactionDetails, echannel;
        let gopayRequestPayload = {}, bankTransfer;

        transactionDetails = {
            order_id: `${prefix}-${order.id}`,
            gross_amount: order.amount
        };

        if(bank === "mandiri") {
            gopayRequestPayload.payment_type = "echannel";
            echannel = {
                bill_info1 : 'Payment For:' + order.user_id,
                bill_info2 : "debt"
            };
            gopayRequestPayload.echannel = echannel;
        } else {
            gopayRequestPayload.payment_type = "bank_transfer";
            bankTransfer = {
                bank: bank,
                permata: {
                    recipient_name: order.user_id,
                }
            };
            gopayRequestPayload.bank_transfer = bankTransfer;
        }

        gopayRequestPayload.transaction_details = transactionDetails;

        return this.getGopaySnapToken(gopayRequestPayload)

    }
}

module.exports = Gopay;
