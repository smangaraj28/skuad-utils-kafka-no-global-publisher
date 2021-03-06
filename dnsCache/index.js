'use strict';

const dns = require('dns');

const Q = require('q');

const DnsCache = {};
module.exports = DnsCache;

DnsCache.lookup = (dnscache, host) => {
    let deferred = Q.defer();

    dnscache.lookup(host, (err, result) => {
        deferred.resolve(result);
    });

    return deferred.promise;
};

DnsCache.setup = (hosts) => {
    const dnscache = require('dnscache')({
        "enable" : true,
        "ttl" : 300,
        "cachesize" : 10
    });
    return Q.try(() => {
        return Q.all(hosts.map(h => DnsCache.lookup(dnscache, h)));
    });
};
