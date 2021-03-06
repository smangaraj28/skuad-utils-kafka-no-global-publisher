'use strict';
module.exports = ({ request, response, context, operation }) => {
    const { logger } = context;
    logger.fields['operationName'] = operation && operation.name && operation.name.value;
    logger.fields['respCode'] = 200;
    if (response.errors && response.errors.length) {
        let errorCode = 0;
        const hideError = !!response.errors.filter(error => {
            let code = error.statusCode || (error.extensions && error.extensions.code);
            if (typeof code !== 'string' && code > errorCode) {
                errorCode = code;
            }
            return error.message.indexOf("ECONNREFUSED") > -1
        }).length;
        if (hideError) {
            delete response.errors
        } else {
            if (logger.fields['respCode'] !== 401) logger.fields['respCode'] = 500;
            if (errorCode) logger.fields['respCode'] = errorCode;
            logger.fields['errors'] = response.errors
        }
    }
};