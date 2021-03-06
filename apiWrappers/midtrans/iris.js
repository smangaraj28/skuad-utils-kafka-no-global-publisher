/* eslint-disable no-buffer-constructor */
/* eslint-disable no-param-reassign */
/*
 * create by akul on 2020-05-16
*/
const request = require('request');
const Q = require('q');
const { BadRequest, STATUS_CODES, ErrorCodes } = require('./../../util/errors');

let API_BASE = 'https://app.sandbox.midtrans.com/iris/api/v1';
if (global.Config.env === 'production') {
    API_BASE = 'https://app.midtrans.com/iris/api/v1';
}

const API_KEY = global.Config.midtrans && global.Config.midtrans.iris_key;

const AUTH_STRING = new Buffer(`${API_KEY}:`).toString('base64');
const AUTHORIZATION = `Basic ${AUTH_STRING}`;

function irisRequest(config, logger) {
    const deferred = Q.defer();

    request(config, (err, response, body) => {
        if (err) {
            deferred.reject(err);
        } else {
            try {
                body = typeof body === 'string' ? JSON.parse(body) : body;
                body.statusCode = response.statusCode;
                logger.info(body, 'iris response');
                if (response.statusCode > 199 && response.statusCode < 400) {
                    deferred.resolve(body);
                } else {
                    deferred.reject(body);
                }
            } catch (e) {
                if (e instanceof SyntaxError && e.message === 'Unexpected token < in JSON at position 0') {
                    e.message = body;
                    logger.warn(`IRIS Service is not working ${body}`);
                } else {
                    logger.error(`iris error response ${body}`);
                }
                deferred.reject(e);
            }
        }
    });
    return deferred.promise;
}

function makeRequest(config = {}, logger, authorization) {
    // time of initiating the iris request
    const startTime = process.hrtime();

    const deferred = Q.defer();

    config.baseUrl = API_BASE;

    if (!config.headers || !config.headers['X-Idempotency-Key']) {
        throw new Error('X-Idempotency-Key is required');
    }

    config.headers.Accept = 'application/json';
    config.headers['Content-Type'] = 'application/json';
    config.headers['Cache-Control'] = 'no-cache';
    config.headers.Authorization = authorization || AUTHORIZATION;
    logger.info(config, 'iris request');

    irisRequest(config, logger)
        .then(deferred.resolve)
        .catch((error) => {
        // retry logic in case of failures on iris end.
            if (error.statusCode >= 500) {
                setTimeout(() => {
                    irisRequest(config, logger)
                        .then(deferred.resolve)
                        .catch((err) => {
                            deferred.reject(err);
                        });
                }, 1000);
            } else {
                deferred.reject(error);
            }
        }).finally(() => {
            logger.info({
                third_party: 'IRIS',
                responseTime: process.hrtime(startTime)[0] * 1000 + process.hrtime(startTime)[1] / 1000000,
            }, '[THIRD_PARTY_CALL] api call completed');
        });


    return deferred.promise;
}


class Iris {
    constructor(props) {
        if (!props.logger) {
            throw new Error('logger is required');
        }
        this.logger = props.logger;
        if (!API_KEY) {
            throw new Error('IRIS API_KEY not present');
        }
    }

    getBeneficiaryBanks(xIdempotencyKey) {
        return makeRequest({
            uri: '/beneficiary_banks',
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger);
    }

    validateBankAccount(bankName, accountNo, xIdempotencyKey) {
        const deferred = Q.defer();

        makeRequest({
            uri: '/account_validation',
            qs: {
                bank: bankName,
                account: accountNo,
            },
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger)
            .then(deferred.resolve)
            .catch((error) => {
                if (error.errors) {
                    if (error.errors.bank && error.errors.bank.length) {
                        return deferred.reject(new BadRequest(`Bank: ${error.errors.bank.join(' AND ')}`));
                    }
                    if (error.errors.account && error.errors.account.length) {
                        return deferred.reject(new BadRequest(
                            `Account: ${error.errors.account.join(' AND ')}`,
                            STATUS_CODES.BAD_REQUEST,
                            { code: ErrorCodes.BANK_ACCOUNT_IS_INVALID },
                        ));
                    }
                }
                return deferred.reject(error);
            });

        return deferred.promise;
    }

    createPayout(
        beneficiaryName,
        accountNo,
        beneficiaryEmail,
        bankName,
        amount,
        cashoutId,
        payoutNote,
        xIdempotencyKey,
    ) {
        const deferred = Q.defer();
        const apiKey = global.Config.IRIS_CREATOR_API_KEY;
        const authString = new Buffer(`${apiKey}:`).toString('base64');
        const authorization = `Basic ${authString}`;

        makeRequest({
            method: 'POST',
            uri: '/payouts',
            json: {
                payouts: [
                    {
                        beneficiary_name: beneficiaryName,
                        beneficiary_account: accountNo,
                        beneficiary_bank: bankName,
                        beneficiary_email: beneficiaryEmail,
                        amount,
                        notes: payoutNote || `Zenius ${cashoutId}`,
                    },
                ],
            },
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger, authorization)
            .then(deferred.resolve)
            .catch((error) => {
                if (error.errors && Object.keys(error.errors).length > 0) {
                    return deferred.reject(new BadRequest(`Error: ${error.errors['0'].join(' AND ')}`));
                } if (error.error_message) {
                    return deferred.reject(new BadRequest(`${error.error_message}`));
                }
                return deferred.reject(error);
            });

        return deferred.promise;
    }

    getPayout(referenceNo, xIdempotencyKey) {
        const deferred = Q.defer();

        makeRequest({
            uri: `/payouts/${referenceNo}`,
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger)
            .then(deferred.resolve)
            .catch((error) => {
                if (error.error_message) {
                    return deferred.reject(new BadRequest(`${error.error_message}`));
                }
                return deferred.reject(error);
            });

        return deferred.promise;
    }

    approvePayout(references, xIdempotencyKey) {
        const deferred = Q.defer();

        makeRequest({
            method: 'POST',
            uri: '/payouts/approve',
            json: {
                reference_nos: [references],
            },
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger)
            .then(deferred.resolve)
            .catch((error) => {
                if (error.errors && error.errors.length) {
                    return deferred.reject(new BadRequest(`Error: ${error.errors.join(' AND ')}`));
                } if (error.error_message) {
                    return deferred.reject(new BadRequest(`${error.error_message}`));
                }
                return deferred.reject(error);
            });

        return deferred.promise;
    }

    rejectPayout(references, rejectionReason, xIdempotencyKey) {
        const deferred = Q.defer();

        makeRequest({
            method: 'POST',
            uri: '/payouts/reject',
            json: {
                reference_nos: [references],
                reject_reason: rejectionReason,
            },
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger)
            .then(deferred.resolve)
            .catch((error) => {
                if (error.errors && error.errors.length) {
                    return deferred.reject(new BadRequest(`Error: ${error.errors.join(' AND ')}`));
                } if (error.error_message) {
                    return deferred.reject(new BadRequest(`${error.error_message}`));
                }
                return deferred.reject(error);
            });

        return deferred.promise;
    }

    createBeneficiary(beneficiaryName, accountNo, beneficiaryEmail, bankName, alias, xIdempotencyKey) {
        const deferred = Q.defer();
        const apiKey = global.Config.IRIS_CREATOR_API_KEY;
        const authString = new Buffer(`${apiKey}:`).toString('base64');
        const authorization = `Basic ${authString}`;

        makeRequest({
            method: 'POST',
            uri: '/beneficiaries',
            json: {
                name: beneficiaryName,
                account: accountNo,
                bank: bankName,
                email: beneficiaryEmail || 'zenius_sample_email@zeniuseducation.com',
                alias_name: alias,
            },
            headers: {
                'X-Idempotency-Key': xIdempotencyKey || this.logger.getContext()['x-request-id'],
            },
        }, this.logger, authorization)
            .then(deferred.resolve)
            .catch((error) => {
                if (error.errors && Object.keys(error.errors).length > 0) {
                    return deferred.reject(new BadRequest(`Error: ${error.errors.join(' AND ')}`));
                } if (error.error_message) {
                    return deferred.reject(new BadRequest(`${error.error_message}`));
                }
                return deferred.reject(error);
            });

        return deferred.promise;
    }
}

module.exports = Iris;
