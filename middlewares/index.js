module.exports = {
    errorHandler: require('./errorHandler'),
    logger: require('./logger'),
    cors: require('./cors'),
    gqlLogger: require('./willResponseGraphql'),
    AuthMiddleware: require('./auth')
};
