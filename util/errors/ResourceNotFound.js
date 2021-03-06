'use strict';

const StatusCodes = require("./StatusCodes");
const CustomError = require("./CustomError");

class ResourceNotFound extends CustomError {
    constructor(message, statusCode = StatusCodes.NOT_FOUND, meta = {}) {
        super(message, statusCode, meta);
        Error.captureStackTrace(this, ResourceNotFound);
        let proto = Object.getPrototypeOf(this);
        proto.name = meta.name || 'ResourceNotFound';
    }
}

module.exports = ResourceNotFound;
