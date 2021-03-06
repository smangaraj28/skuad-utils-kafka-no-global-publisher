'use strict';

const Logger = require('../logger');

module.exports = (err, req, res, next) => {
    if(!req.logger){
        req.logger = Logger.getInstance({'startTime': process.hrtime()});
    }
    if(err.statusCode){
        res.status(err.statusCode);
    } else {
        res.status(500);
    }
    req.logger.error.call(req.logger, {
        req,
        res,
        err,
        'responseTime': process.hrtime(req.logger.fields.startTime)
    }, err.message);

    const errObj = err.getErrorObject ? err.getErrorObject() : {
        code: err.code || err.statusCode,
        error_message: err.message || 'Ops! Something went wrong'
    };

    res.send(errObj);
};