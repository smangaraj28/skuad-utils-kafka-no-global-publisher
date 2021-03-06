const Helpers = {};
module.exports = Helpers;

const crypto = require('crypto');
const { UnAuthorisedError, STATUS_CODES, BadRequest, ErrorCodes } = require('./errors');
const moment = require('moment');
const _ = require('lodash');
const Q = require('q');
const fs = require('fs');
const Firebase = require('../apiWrappers/firebase');

Helpers.generateHash = (toHash, key, algo = 'sha256') => {
    return crypto.createHash(algo)
        .update(toHash)
        .digest('hex');
};

Helpers.extractToken = (headers) => {
    let token = headers['x-access-token'] || headers['authorization'] || headers['x-token'];
    if (token && token.startsWith('Bearer ')) {
        return token.slice(7, token.length);
    }
    throw new UnAuthorisedError('access token not present in headers', STATUS_CODES.UNAUTHENTICATED_REQUEST);
};

Helpers.extractFireUser = async (headers) => {
    const idToken = Helpers.extractToken(headers);
    if (!idToken) {
        throw new UnAuthorisedError(e.message || 'Missing Authorization Header for Request', STATUS_CODES.UNAUTHENTICATED_REQUEST);
    }

    if (!Firebase) {
        // this shouldn't never happen ideally unless Config is missing
        throw new BadRequest('Firebase Config missing', STATUS_CODES.INTERNAL_SERVER_ERROR);
    }

    try {
        return await Firebase.auth().verifyIdToken(idToken);
    } catch (e) {
        throw new UnAuthorisedError(e.message || 'Firebase auth failed', STATUS_CODES.UNAUTHENTICATED_REQUEST);
    }
};

Helpers.extractAPIKey = (headers) => {
    let token = headers['api-key'];
    if (!token) {
        throw new UnAuthorisedError('api-key is not present in headers', STATUS_CODES.UNAUTHENTICATED_REQUEST);
    }
    return token;
};

Helpers.returnNullOrThrow = (error) => {
    if (error instanceof Error) {
        if (error.statusCode === STATUS_CODES.NOT_FOUND) {
            return null;
        } else {
            throw error;
        }
    }
    return error;
};

Helpers.isValidEmail = (email) => {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!re.test(email)) {
        throw new BadRequest('Invalid Email', STATUS_CODES.UNPROCESSABLE_ENTITY, {
            code: ErrorCodes.INVALID_INPUT,
            message: `Invalid Email ${email}`
        });
    }
    return email;
};

Helpers.isValidDate = (dob) => {
    if (dob && dob.match(/^\d{4}\-\d{1,2}\-\d{1,2}$/)) {
        let d = new Date(dob);
        if (!isNaN(d.getTime())) {
            return dob;
        }
    }
    throw new BadRequest('Invalid DOB', STATUS_CODES.UNPROCESSABLE_ENTITY, {
        code: ErrorCodes.INVALID_INPUT,
        message: `Invalid Date Of Birth ${dob}`
    });
};

Helpers.formatDate = (date, desiredFormat) => {
    return moment(date).format(desiredFormat);
};

Helpers.parseDatePreset = (datePreset, dateFormat) => {
    const date = moment();
    const dateRange = {};
    dateRange.until = date.format(dateFormat);
    switch (datePreset) {
        case 'last_7_days':
            dateRange.since = date.subtract(7, 'days').format(dateFormat);
            break;
        case 'last_10_days':
            dateRange.since = date.subtract(10, 'days').format(dateFormat);
            break;
        case 'last_30_days':
            dateRange.since = date.subtract(30, 'days').format(dateFormat);
            break;
        case 'last_60_days':
            dateRange.since = date.subtract(2, 'months').format(dateFormat);
            break;
        case 'last_1_year':
            dateRange.since = date.subtract(1, 'years').format(dateFormat);
            break;
        default:
            break;
    }
    return dateRange;
};

Helpers.setCustomNumberFormatForSheet = (sheet, customHighlightingOptions, dataRange) => {
    switch (customHighlightingOptions.type) {
        case 'highlight_cells_with_value_below_threshold':
            dataRange.setNumberFormat(
                `[${customHighlightingOptions.colour}][<${customHighlightingOptions.threshold}]0.00;[>=${customHighlightingOptions.threshold}]0.00`
            );
            break;
        case 'highlight_cells_with_value_above_threshold':
            dataRange.setNumberFormat(
                `[${customHighlightingOptions.colour}][>${customHighlightingOptions.threshold}]0.00;[<=${customHighlightingOptions.threshold}]0.00`
            );
            break;
        default:
            break;
    }
};

Helpers.parseError = function (err) {
    let errorMessage = null;
    let statusCode = null;
    let errorCode = null;
    if (err && err.validationError) {
        errorMessage = err.message;
        statusCode = 400;
        errorCode = err.errorCode;
    } else {
        // Log and return any unknown errors
        try {
            err = JSON.parse(err);
            /* eslint-disable */
        } catch (e) { } // # NOQA
        /* eslint-enable */
        statusCode = err.status && _.isNumber(err.status) ? err.status : 500;
        // if SMM properly formats their error message, parse it out....otherwise FMM will pick up the whole message
        if (err && err.errors && err.errors[0] && err.errors[0].message && err.errors[0].message.SnapchatRequestError && err.errors[0].message.SnapchatRequestError.display_message) {
            errorMessage = err.errors[0].message.SnapchatRequestError.display_message;
        } else if (err && err.error && err.error.error && err.error.error.display_message) {
            // Snapchat error message
            errorMessage = err.error.error.display_message;
        } else if (err && err.data && err.data.errors && err.data.errors.length && err.data.errors[0].message) {
            // TMM error message
            errorMessage = err.data.errors[0].message;
        } else if (err && err.errors && err.errors.length && err.errors[0].message) {
            // FMM error message
            errorMessage = err.errors[0].message;
        } else if (err && err.errors && err.errors.message) {
            // PMM error message
            errorMessage = err.errors.message;
        } else if (err && err.error ) {
            try {
                err.error = JSON.parse(err.error);
                /* eslint-disable */
            } catch (e) {} // # NOQA
            /* eslint-enable */
            if (err.error.errors && err.error.errors[0] && err.error.errors[0].message) {
                // Stringified FMM error message
                errorMessage = err.error.errors[0].message;
            } else if (err.error.error_user_title && err.error.error_user_msg) {
                // Direct FB error message
                errorMessage = err.error.error_user_title + ': ' + err.error.error_user_msg;
            } else if (err.error.error && err.error.error.error_user_title && err.error.error.error_user_msg) {
                // Formatted FB error message from facebookService
                errorMessage = err.error.error.error_user_title + ': ' + err.error.error.error_user_msg;
            } else if (err.error.error && err.error.error.message) {
                // FB error
                errorMessage = err.error.error.message;
            } else if (err.error.message_detail) {
                // Pinterest error
                errorMessage = err.error.message_detail;
            } else if (err.error.debug_message) {
                // Snapchat error
                errorMessage = err.error.debug_message;
            } else if (err.error.data && err.error.data.errors && err.error.data.errors[0] && err.error.data.errors[0].message) {
                // Twitter error message
                errorMessage = err.error.data.errors[0].message;
            } else if (err.error.error && _.isString(err.error.error)) {
                errorMessage = err.error.error;
            } else if (err.error && _.isString(err.error)) {
                errorMessage = err.error;
            } else if (err.error && err.error.operation_errors) {
                // twitter batch errors
                let errors = _.find(err.error.operation_errors, function(item) {
                    return item.length > 0;
                });
                errorMessage = '';
                let errorMessages = _.map(errors, 'message');
                errorMessage = errorMessages.join(', ');
                _.each(errors, function(error) {
                    errorMessage += error.message;
                });
            } else if (err.error.data) {
                try {
                    // Twitter error message
                    err.error.data = JSON.parse(err.error.data);
                    /* eslint-disable */
                } catch (e) {} // # NOQA
                /* eslint-enable */
                if (err.error.data.errors && err.error.data.errors[0] && err.error.data.errors[0].message) {
                    errorMessage = err.error.data.errors[0].message;
                }
            }
        } else if (err.message) {
            errorMessage = err.message;
        } else if (err.debug_message) {
            errorMessage = err.debug_message;
        }
    }
    if (!errorMessage) {
        errorMessage = 'An unkown error occurred. (' + statusCode + ')';
    }
    let errorObject = {
        message: errorMessage.toString(),
        status: statusCode
    };
    if (errorCode) {
        errorObject.errorCode = errorCode;
    }
    return errorObject;
};

//Recursively flatten an object
Helpers.flattenObject = function (object) {
    let flatObject = {};
    _.forEach(object, function (value, key) {
        if (typeof value === 'object') {
            let flatValue = Helpers.flattenObject(value);
            _.assign(flatObject, flatValue);
        }
        else {
            flatObject[key] = value;
        }
    });
    return flatObject;
};

/**
 * sequentiallyBatchFunctionCalls
 *
 * params:
 *   - requestArray - An array of request objects. The request object should consist of a function (functionCall)
 *                    and an array of arguments to call the function with (arguments).
 *                    let requestObject = {
 *                      functionCall: console.log,
 *                      arguments: [ 'test' ]
 *                    };
 *                    result: console.log('test');
 *   - breakOnError - If true promises will be resolved with Q.all. Otherwise, they will be resolved with Q.allSettled.
 *   - batchSize - The number of requests to make at once. Defaults to 100 if not specified.
 *
 * modifies - none
 *
 * returns - The array of results from all requests. Order is preserved.
 *
 * Makes a series of calls using the specified functions and arguments in sequential batches
 */
Helpers.sequentiallyBatchFunctionCalls = function (requestArray, breakOnError, batchSize) {
    let allResults = [];
    batchSize = batchSize || 100;
    let resolvePromises = breakOnError ? Q.all : Q.allSettled;
    let requestBatches = _.chunk(requestArray, batchSize);
    //Make the function calls in sequential batches
    let fulfillBatchFunctionCalls = function (nextIndex) {
        let index = nextIndex || 0;
        let requestBatch = requestBatches[index];
        let batchPromises = [];
        _.forEach(requestBatch, function (request) {
            //Apply allows us to pass in an array of arguments instead of breaking them out
            batchPromises.push(request.functionCall.apply(null, request.arguments));
        });
        return resolvePromises(batchPromises)
            .then(function (batchResults) {
                allResults = allResults.concat(batchResults);
                index++;
                //Fulfill the next batch if it exists. Otherwise, return the results.
                if (requestBatches[index]) {
                    return fulfillBatchFunctionCalls(index);
                }
                else {
                    return allResults;
                }
            });
    };
    return fulfillBatchFunctionCalls();
};

Helpers.csvToJson = function (filePath) {
    let defer = Q.defer();

    // Extract file data
    fs.readFile(filePath, 'utf8', function (err, data) {
        if (err) {
            defer.reject(err);
        }
        else {
            defer.fulfill(Helpers.parseCSVFile(data));
        }
    });

    return defer.promise;
};

Helpers.csvToJsonSync = function (filePath) {
    // Extract file data
    let data = fs.readFileSync(filePath, 'utf-8');
    return Helpers.parseCSVFile(data);
};

Helpers.parseCSVFile = function (data) {
    let properties=[];
    let csvData=[];
    let lines = data.split('\n').filter(Boolean);

    for(let index = 0; index < lines.length; index++){
        let csvrow = lines[index].replace(/[\n\r]+/g, '').split(',');
        if (index === 0){
            properties = csvrow;
        }
        else {
            let row = {};
            for(let lineIndex = 0; lineIndex < csvrow.length; lineIndex++){
                row[properties[lineIndex]] = csvrow[lineIndex];
            }
            csvData.push(row);
        }
    }

    return csvData;
};


Helpers.formatCampaignsForDisplay = function (experiment, ads) {
    var campaigns = [];
    _.forEach(experiment.campaigns, function (c) {
        var channelAd = _.find(ads, function (ad) { return ad.channel = c.channel; });
        var campaign = {
            channel: Helpers.humanizeText(c.channel),
            id: c.id,
            name: channelAd ? channelAd.campaignName : experiment.name,
            objective: c.objective ? Helpers.humanizeText(c.objective) : 'N/A',
            accountName: c.account.name
        };
        if (channelAd && channelAd.status === 'CAMPAIGN_INACTIVE') {
            campaign.status = 'Inactive';
        } else if (channelAd) {
            campaign.status = 'Active';
        }
        // Only add a campaign to the list if it hasn't been archived or deleted
        if ((campaign.status != null) && !(channelAd.deletedOrArchived)) {
            campaigns.push(campaign);
        }
    });
    return campaigns;
};

Helpers.humanizeText = function (input) {
    return input.replace(/(^|_)(\w)/g, function ($0, $1, $2) {
        return ($1 && ' ') + $2.toUpperCase();
    }).replace(/([a-z](?=[A-Z]))/g, '$1 ');
};

Helpers.EquationEvaluator = (trigger_condition, dependencies) => {
    let triggerConditionMet = true;

    // Trigger condition can be in the form of an object having key/value pairs wherein each key points to a property in dependencies
    if (trigger_condition && trigger_condition.constructor === {}.constructor) {
        for (const key in trigger_condition) {
            const conditionValue = key.split('.').reduce((previousValue, currentValue) => {
                return previousValue ? previousValue[currentValue] : null;
            }, dependencies);

            triggerConditionMet = triggerConditionMet && trigger_condition[key] === conditionValue;
        }
    } else if (trigger_condition && trigger_condition.constructor === "".constructor) {
        // Each such 'expression' can be an ES6 templatized string which yields a result and that result can be compared to 'value' property using provided 'op'

        // new Function('dependencies','return (dependencies.user.balance >= 100 or dependencies.user.balance <= 1000) and (dependencies.user.type === \'premium\')')(dependencies)
        triggerConditionMet = new Function('dependencies', 'return ' + (trigger_condition) + ';')(dependencies);
    }


    return triggerConditionMet;
};
Helpers.UnhandledErrorNotifier = (logger, SES) => {
    process.on('uncaughtException', function (error) {
        SES.sendEmail({
            to: (global.Config.email && global.Config.email.defaultTo) || `ak+${global.Config.env}@skuad.io`,
            subject: `Uncaught Exception at ${global.Config.logger && global.Config.logger.name} ${global.Config.env}:${global.Config.port}`,
            text: error.stack
        }, null, logger)
            .finally(() => {
                process.exit(1000);
            });
    });

    process.on('unhandledRejection', function (error) {
        SES.sendEmail({
            to: (global.Config.email && global.Config.email.defaultTo) || `ak+${global.Config.env}@skuad.io`,
            subject: `Uncaught Rejection at ${global.Config.logger && global.Config.logger.name} ${global.Config.env}:${global.Config.port}`,
            text: error.stack
        }, null, logger)
            .finally(() => {
                // process.exit(1000);
            });
    });
};

Helpers.dateDiff = {
    inDays: function(d1, d2) {
        var t2 = d2.getTime();
        var t1 = d1.getTime();
        return parseInt((t2-t1)/(24*3600*1000));
    },
    inWeeks: function(d1, d2) {
        var t2 = d2.getTime();
        var t1 = d1.getTime();

        return parseInt((t2-t1)/(24*3600*1000*7));
    },
    inMonths: function(d1, d2) {
        var d1Y = d1.getFullYear();
        var d2Y = d2.getFullYear();
        var d1M = d1.getMonth();
        var d2M = d2.getMonth();
        return (d2M+12*d2Y)-(d1M+12*d1Y);
    },
    inYears: function(d1, d2) {
        return d2.getFullYear()-d1.getFullYear();
    }
};

Helpers.isValidSubscription = (contentPrivileges, me) => {
    if (!Array.isArray(contentPrivileges) || !contentPrivileges.length) return true;
    const { plans: userPrivileges} = me;
    if(Array.isArray(contentPrivileges) && contentPrivileges.length) {
        if (Array.isArray(userPrivileges) && userPrivileges.length) {
            return Helpers.filterActiveSubscriptions(userPrivileges, contentPrivileges).length > 0;
        }
        return false;
    }
};

Helpers.filterActiveSubscriptions = (plans, contentPrivileges) => {
    return plans.filter(up => {
        const [sku, date] = up.split('|');
        if(!date || !sku) return false;
        if (!!contentPrivileges) return contentPrivileges.indexOf(sku) > -1 && (new Date() - new Date(date)) < 0;
        return (new Date() - new Date(date)) < 0;
    });
};

