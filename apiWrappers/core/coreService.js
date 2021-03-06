'use strict';

const CoreService = {};
module.exports = CoreService;

const request = require('request');
const querystring = require('querystring');
const Q = require('q');
const {BadRequest, ResourceNotFound, STATUS_CODES} = require("../../util/errors");
const Logger = require('../../logger').getInstance({
    module: 'core-service-api-wrapper'
});

CoreService.makeRequest = (options, logger) => {
    let deferred = Q.defer();

    if (!options.baseUrl) {
        throw new Error('Unknown Internal Host');
    }

    if (!options.headers) {
        options.headers = {};
    }

    options.forever = true;

    if (logger) {
        const loggerContext = logger.getContext();
        options.headers['x-request-id'] = loggerContext['x-request-id'];
        options.headers['x-b3-traceid'] = loggerContext['x-b3-traceid'];
        options.headers['x-b3-spanid'] = loggerContext['x-b3-spanid'];
        options.headers['x-b3-parentspanid'] = loggerContext['x-b3-parentspanid'];
        options.headers['x-b3-sampled'] = loggerContext['x-b3-sampled'];
        options.headers['x-b3-flags'] = loggerContext['x-b3-flags'];
        options.headers['x-ot-span-context'] = loggerContext['x-ot-span-context'];
    } else {
        Logger.error({
            uri: options.uri
        },'logger not passed');
        logger = Logger;
    }

    request(options, function (err, response, body) {
        try {
            if (err) {
                deferred.reject(err);
            } else if (response && response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 204) {
                try {
                    body = JSON.parse(body);
                } catch (e) {}
                if (response.statusCode === STATUS_CODES.NOT_FOUND) {
                    let e;
                    if (body.error === "Not Found" && body.path) {
                        e = new Error(`${body.path} - ${body.error}`);
                    } else {
                        if (body.message) {
                            e = new ResourceNotFound(body.message, STATUS_CODES.NOT_FOUND,{exception: body.exception});
                        } else {
                            deferred.reject(new ResourceNotFound(response.statusMessage));
                        }
                    }
                    return deferred.reject(e);
                } else {
                    const e = new BadRequest(body.message || response.statusMessage, STATUS_CODES.BAD_REQUEST, body);
                    deferred.reject(e);
                }
            } else if (body) {
                if (!options.json) {
                    body = JSON.parse(body);
                }
                deferred.resolve(body);
            } else if (response.statusCode === 204 && options.method === "DELETE") {
                deferred.resolve(body);
            } else {
                const e = new Error(body.message);
                deferred.reject(e);
            }
        } catch (exception) {
            logger.error(exception);
            deferred.reject(exception);
        }
    });

    return deferred.promise;
};

CoreService.search = (resource, method, criteria = {}, options = {}) => {
    const uri = `${resource}/search${method}?${querystring.encode(criteria)}`;
    let deferred = Q.defer();

    CoreService.makeRequest({uri}, options.logger)
        .then(deferred.resolve)
        .catch(error => {

        if (options.resolveOnErrors) {
            if (options.resolveOnErrors.filter(e => {
                if (error instanceof e) {
                    return true
                }
            }).length) {
                deferred.resolve(error);
            } else {
                deferred.reject(error);
            }
        } else if (options.resolveOnError) {
            deferred.resolve(error);
        } else {
            deferred.reject(error);
        }
    });

    return deferred.promise;
};

// CoreService.filter = (resource, filter = {}, options = {}) => {
//     const uri = `${resource}/filter?${querystring.encode(filter)}`;
//     let deferred = Q.defer();
//
//     CoreService.makeRequest({
//         uri
//     }, options.logger).then(deferred.resolve)
//         .catch(error => {
//             if (options.resolveOnError) {
//                 deferred.resolve(error);
//             } else {
//                 deferred.reject(error);
//             }
//         });
//
//     return deferred.promise;
// };

CoreService.post = (resource, data, options = {}) => {
    return CoreService.makeRequest({
        baseUrl: options.baseUrl,
        uri: resource,
        method: 'post',
        json: data,
        headers: options.headers
    }, options.logger);
};

CoreService.get = (resource, query = {}, options = {}) => {
    return CoreService.makeRequest({
        baseUrl: options.baseUrl,
        uri: resource,
        qs: query,
        headers: options.headers
    }, options.logger);
};

CoreService.put = (resource, data, options = {}) => {
    return CoreService.makeRequest({
        baseUrl: options.baseUrl,
        uri: resource,
        method: 'put',
        json: data,
        headers: options.headers
    }, options.logger);
};

CoreService.patch = (resource, data, options = {}) => {
    return CoreService.makeRequest({
        baseUrl: options.baseUrl,
        uri: resource,
        method: 'patch',
        json: data,
        headers: options.headers
    }, options.logger);
};

CoreService.delete = (resource, data, options = {}) => {
    return CoreService.makeRequest({
        baseUrl: options.baseUrl,
        uri: resource,
        method: 'delete',
        json: data,
        headers: options.headers
    }, options.logger);
};
