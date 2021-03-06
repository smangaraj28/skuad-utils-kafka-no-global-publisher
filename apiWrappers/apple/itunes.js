/* eslint-disable no-param-reassign */
/*
 * create by akul on 2020-06-07
*/
const request = require('request');
const Q = require('q');
const crypto = require('crypto');
const CustomError = require('../../util/errors/CustomError');

let ITUNES_API_BASE = 'https://sandbox.itunes.apple.com';
if (global.Config.env === 'production') {
    ITUNES_API_BASE = 'https://buy.itunes.apple.com';
}

const API_KEY = global.Config.apple && global.Config.apple.server_key;

// eslint-disable-next-line new-cap
function isRetryable(receipt) {
    let s = receipt['is-retryable'];
    if (typeof s === 'boolean') {
        return s;
    }
    else if (typeof s === 'string') {
        s = s.toLowerCase();
        if (s === 'true') {
            return true;
        }
        const n = parseInt(s);
        return !isNaN(n) && (n !== 0);
    }
    else if (typeof s === 'number') {
        return !isNaN(s) && (s !== 0);
    }
    return false;
}

function appleRequest(config, logger) {
    const deferred = Q.defer();

    request(config, (err, response, body) => {
        if (err) {
            logger.error(err, 'apple response');
            // error.data = data; TODO check the error response
            // status = data ? data.status : 1;
            // validatedData = {
            //     status: status,
            //     message: errorMap[status] || 'Unknown',
            // };
            // error.appleStatus = status;
            // error.isRetryable = isRetryable(data);
            deferred.reject(err);
        } else if (response.statusCode === 201 || response.statusCode === 200) {
            logger.info(body, 'apple response');
            deferred.resolve(body);
        } else {
            logger.error(body, 'apple response');
            deferred.reject(body);
        }
    });

    return deferred.promise;
}

function makeRequest(config = {}, logger) {
    // time of initiating the apple request
    const startTime = process.hrtime();

    const deferred = Q.defer();

    if (!config.baseUrl) config.baseUrl = ITUNES_API_BASE;

    config.headers['Content-Type'] = 'application/json';
    config.headers.Accept = 'application/json';
    // config.headers.Authorization = AUTHORIZATION;

    logger.info(config, 'apple request');

    appleRequest(config, logger)
        .then(deferred.resolve)
        .catch((error) => {
            logger.error(error, 'apple error');
            appleRequest(config, logger)
                .then(deferred.resolve)
                .catch((err) => {
                    logger.error(err, 'apple error');
                    deferred.reject(err);
                });
        }).finally(() => {
        logger.info({
            third_party: 'APPLE',
            responseTime: process.hrtime(startTime)[0] * 1000 + process.hrtime(startTime)[1] / 1000000,
        }, '[THIRD_PARTY_CALL] api call completed');
    });

    return deferred.promise;
}

const errorMap = Object.freeze({
    21000: 'The App Store could not read the JSON object you provided.',
    21002: 'The data in the receipt-data property was malformed.',
    21003: 'The receipt could not be authenticated.',
    21004: 'The shared secret you provided does not match the shared secret on file for your account.',
    21005: 'The receipt server is not currently available.',
    21006: 'This receipt is valid but the subscription has expired. When this status code is returned to your server, the receipt data is also decoded and returned as part of the response.',
    21007: 'This receipt is a sandbox receipt, but it was sent to the production service for verification.',
    21008: 'This receipt is a production receipt, but it was sent to the sandbox service for verification.',
    2: 'The receipt is valid, but purchased nothing.',
    21010: 'This receipt could not be authorized. Treat this the same as if a purchase was never made.',
});

const REC_KEYS = Object.freeze({
    IN_APP: 'in_app',
    LRI: 'latest_receipt_info',
    BUNDLE_ID: 'bundle_id',
    TRANSACTION_ID: 'transaction_id',
    ORIGINAL_TRANSACTION_ID: 'original_transaction_id',
    PRODUCT_ID: 'product_id',
    PURCHASE_DATE: 'purchase_date',
    PURCHASE_DATE_MS: 'purchase_date_ms',
    EXPIRES_DATE_MS: 'expires_date_ms',
    EXPIRES_DATE: 'expires_date'
});


const VALIDATION = Object.freeze({
    SUCCESS: 0,
    FAILURE: 1,
    POSSIBLE_HACK: 2
});

class iTunes {
    constructor(props) {
        if (!props.logger) {
            throw new Error('logger is required');
        }
        this.logger = props.logger;
        this.retry = 0;
        if (!API_KEY) {
            throw new Error('APPLE API_KEY not present');
        }
    }

    verifyReceipt(receipt, baseUrl, retry = 1) {
        let data = {
            'receipt-data': receipt,
            'password': API_KEY
        };

        return makeRequest({
            baseUrl,
            uri: '/verifyReceipt',
            json: data,
            headers: {},
            method: 'POST',
        }, this.logger)
            .then(data => {
                let resp = data;
                // apple responded with error
                if (data.status > 0 && (data.status !== 21007 || retry > 1)) {
                    this.logger.error('verification failed:', data);
                    let status = data.status;
                    const emsg = errorMap[status] || ('Receipt validation status = ' + status);
                    resp = {
                        data,
                        code: status,
                        isRetryable: isRetryable(data)
                    };
                    throw new CustomError(emsg, 422, resp);
                } else if (data.status === 21007 && retry === 1) {
                    return this.verifyReceipt(receipt, 'https://sandbox.itunes.apple.com', retry + 1);
                }
                this.retry = 0;
                if (data.receipt[REC_KEYS.IN_APP] && !data.receipt[REC_KEYS.IN_APP].length) {
                    // receipt is valid, but the receipt bought nothing
                    // probably hacked: https://forums.developer.apple.com/thread/8954
                    // https://developer.apple.com/library/mac/technotes/tn2413/_index.html#//apple_ref/doc/uid/DTS40016228-CH1-RECEIPT-HOW_DO_I_USE_THE_CANCELLATION_DATE_FIELD_
                    // resp = {
                    //     statusCode: VALIDATION.POSSIBLE_HACK,
                    //     message: errorMap[VALIDATION.POSSIBLE_HACK]
                    // };
                    this.logger.error(
                        'Empty purchased detected: in_app array is empty: consider invalid and does not validate',
                        data
                    );
                    throw new CustomError(errorMap[VALIDATION.POSSIBLE_HACK], 422, {code: VALIDATION.POSSIBLE_HACK});
                }
                return resp;
            })
            .catch(e => {
                if (e.isRetryable && this.retry < 3) {
                    this.retry += 1;
                    return this.verifyReceipt(receipt);
                }
                throw e;
            })

    }
}

module.exports = iTunes;
