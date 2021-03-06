'use strict';

const RedisPool = require('redis-connection-pool');
const Q = require('q');

const Cache = {};
module.exports = Cache;

let cache_client = null;

function parseVal(val) {
    let result;
    if (typeof val !== 'string') {
        return val;
    }
    try {
        result = JSON.parse(val);
    } catch (e) {
        result = val;
    }
    return result;
}

function stringifyObj(obj) {
    let result;
    if (typeof obj === 'string') {
        return obj;
    }
    try {
        result = JSON.stringify(obj);
    } catch (e) {
        result = obj;
    }
    return result;
}

Cache.getInstance = () => {
    return Q.try(() => {
        if (!cache_client) {
            cache_client = RedisPool('LukasRedisPool', {
                url: global.Config.cache.redis_url,
                host: global.Config.cache.redis_host,
                post: global.Config.cache.redis_port,
                max_clients: 30,
                perform_checks: false,
                database: 0
            });
        }
        return cache_client;
    });
};

Cache.get = (key) => {
    let deferred = Q.defer();

    Cache.getInstance()
        .then(instance => {
            instance.get(key, (error, reply) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(parseVal(reply));
                }
            });
        })
        .catch(deferred.reject);

    return deferred.promise;
};

Cache.set = (key, value) => {
    let deferred = Q.defer();

    Cache.getInstance()
        .then(instance => {
            instance.set(key, stringifyObj(value), (error, reply) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(value);
                }
            });
        })
        .catch(deferred.reject);

    return deferred.promise;
};

Cache.del = (key) => {
    let deferred = Q.defer();

    Cache.getInstance()
        .then(instance => {
            instance.del(key, (error, reply) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(reply);
                }
            });
        })
        .catch(deferred.reject);

    return deferred.promise;
};
