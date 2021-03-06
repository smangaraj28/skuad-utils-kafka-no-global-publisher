'use strict';

const Logger = require('../logger');

module.exports = function (req, res, next) {
    const props = {
        startTime: process.hrtime()
    };

    if (req.headers['x-request-id']) {
        props['x-request-id'] = req.headers['x-request-id'];
        props['x-b3-traceid'] = req.headers['x-b3-traceid'];
        props['x-b3-spanid'] = req.headers['x-b3-spanid'];
        props['x-b3-parentspanid'] = req.headers['x-b3-parentspanid'];
        props['x-b3-sampled'] = req.headers['x-b3-sampled'];
        props['x-b3-flags'] = req.headers['x-b3-flags'];
        props['x-ot-span-context'] = req.headers['x-ot-span-context'];
    }

    req.logger = Logger.getInstance(props);

    if(req.originalUrl === '/health'){
        return next();
    }

    if(req.originalUrl === '/api/health'){
        return next();
    }

    logRequest(req);

    res.on('finish', logResponse.bind(null, req, res));
    // res.on('close', logResponse.bind(null, req, res));

    next();
};

function logRequest(req) {
    req.logger.debug.call(req.logger, {'req': req}, `${req.method} ${req.originalUrl}`);
}

function logResponse(req, res) {
    res.removeListener('finish', logResponse);
    res.removeListener('close', logResponse);
    var responseTime = process.hrtime(req.logger.fields.startTime)
    var meta = {
        responseTime,
        'responseTimeSec': responseTime && responseTime.length > 0 && responseTime[0],
        'reponseTimeMs' : responseTime && responseTime.length === 2 && ((responseTime[1])/1000000),
        'req': req,
        'res': res
    };

    if(req.user) {
        meta['uid'] = {'email':req.user.email};
    }
    req.logger.info.call(req.logger, meta, `${req.method} ${req.originalUrl}`);
}
