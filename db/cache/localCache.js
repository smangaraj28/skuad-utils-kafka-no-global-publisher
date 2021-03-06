'use strict';

const NodeCache = require('node-cache');
const Q = require('q');

let cacheClient = new NodeCache({
    stdTTL: 300,
    checkperiod: 10
});

const Cache = {};

Cache.set = (key, value) => {
    let deferred = Q.defer();

    cacheClient.set(key, value, (error, success) => {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(value);
        }
    });

    return deferred.promise;
};

Cache.get = (key) => {
    let deferred = Q.defer();

    cacheClient.get(key, (error, value) => {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(value);
        }
    });

    return deferred.promise;
};

Cache.del = (key) => {
    let deferred = Q.defer();

    cacheClient.del(key, (error, count) => {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(count);
        }
    });

    return deferred.promise;
};

module.exports = Cache;
