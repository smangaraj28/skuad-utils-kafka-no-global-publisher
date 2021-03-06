'use strict';

const redis = require('redis');
const Q = require('q');

let cache_client = null;
let cache_client_deferred = null;
let dateFields = ['access_token_expires_at'];

function parseVal(val) {
    if (typeof val !== 'string') return val;
    try {
        val = JSON.parse(val);
    } catch (e) {
    }
    return val;
}

function stringifyObj(obj) {
    if (typeof obj === 'string') return obj;
    try {
        obj = JSON.stringify(obj);
    } catch (e) {
    }
    return obj;
}

const Cache = {
    getInstance: function getInstance() {
        let deferred = Q.defer();
        if (cache_client) {
            return Q.resolve(cache_client);
        }
        if (cache_client_deferred && cache_client_deferred.promise.inspect().state === 'pending') {
            return cache_client_deferred.promise;
        } else {
            cache_client_deferred = deferred;
        }
        let client = redis.createClient({
            url: global.Config.cache.redis_url,
            host: global.Config.cache.redis_host,
            port: global.Config.cache.redis_port,
            db: global.Config.cache.redis_db
        });
        client.on('connect', function () {
            cache_client = client;
            deferred.resolve(cache_client);
        });
        client.on('error', function (error) {
            return deferred.reject(error);
        });
        return deferred.promise;
    },
    set: function set(key, value) {
        let deferred = Q.defer();
        this.getInstance()
            .then(function (instance) {
                instance.set(key, stringifyObj(value), function (err) {
                    if (err) {
                        return deferred.reject(err);
                    }
                    deferred.resolve(value);
                });
            })
            .fail(function (err) {
                return deferred.reject(err);
            });

        return deferred.promise;
    },
    get: function get(key) {
        let deferred = Q.defer();
        this.getInstance()
            .then(function (instance) {
                instance.get(key, function (err, value) {
                    if (err) {
                        return deferred.reject(err);
                    }
                    deferred.resolve(parseVal(value));
                });
            })
            .fail(function (err) {
                return deferred.reject(err);
            });

        return deferred.promise;
    },
    del: function del(key) {
        let deferred = Q.defer();
        this.getInstance()
            .then(instance => {
                instance.del(key, (err, count) => {
                    if (err) {
                        deferred.reject(err);
                    } else {
                        deferred.resolve(count);
                    }
                })
            })
            .fail(deferred.reject);
        return deferred.promise;
    },
    mset: function (object) {
        let self = this;
        let promises = [];

        Object.keys(object).forEach(key => {
            promises.push(self.set(key, object[key]));
        });

        return Q.all(promises);
    },
    set_with_ttl: function (key, val, timeInSeconds) {
        let deferred = Q.defer();

        this.getInstance()
            .then(instance => {
                instance.set(key, stringifyObj(val), 'EX', timeInSeconds, (err, result) => {
                    if (err) {
                        deferred.reject(err);
                    } else if (result !== 'OK') {
                        deferred.reject(new Error('Error setting value in redis'));
                    } else {
                        deferred.resolve(val);
                    }
                });
            });

        return deferred.promise;
    },
    incr: function incr(key) {
        let deferred = Q.defer();
        this.getInstance()
            .then(function (instance) {
                instance.incr(key, function (err, newValue) {
                    if (err) {
                        return deferred.reject(err);
                    }
                    deferred.resolve(newValue);
                });
            })
            .fail(function (err) {
                return deferred.reject(err);
            });

        return deferred.promise; s
    },
    Key_exists: function Key_exists(key) {
        let deferred = Q.defer();
        this.getInstance()
            .then(function (instance) {
                instance.exists(key, function (err, reply) {
                    if (err) {
                        return deferred.reject(err);
                    }
                    if (reply === 1) {
                        deferred.resolve(true);
                    } else {
                        deferred.resolve(false);
                    }
                });
            })
            .fail(function (err) {
                return deferred.reject(err);
            });

        return deferred.promise;
    },
    get_ttl: function get_ttl(key) {
        let deferred = Q.defer();
        this.getInstance()
            .then(function (instance) {
                instance.ttl(key, function (err, value) {
                    if (err) {
                        return deferred.reject(err);
                    }
                    deferred.resolve(parseVal(value));
                });
            })
            .fail(function (err) {
                return deferred.reject(err);
            });
        return deferred.promise;
    }
};

module.exports = Cache;
