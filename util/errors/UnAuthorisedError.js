'use strict';

const StatusCodes = require("./StatusCodes");
const CustomError = require('./CustomError');

class UnAuthorisedError extends CustomError {
    constructor(message, statusCode = StatusCodes.UNAUTHORIZED_REQUEST, meta = {}) {
        super(message, statusCode, meta);
        Error.captureStackTrace(this, UnAuthorisedError);
        let proto = Object.getPrototypeOf(this);
        proto.name = meta.name || 'UnAuthorised Request';
    }
}

module.exports = UnAuthorisedError;
