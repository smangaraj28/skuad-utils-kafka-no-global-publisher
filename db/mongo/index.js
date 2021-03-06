'use strict';

const mongoose = require('mongoose');
const MongoWatcher = require('./watcher');
let connections = {};

const createConnection = config => {
    if (connections[config.database])
        return connections[config.database];
    if(!connections['read']) connections['read'] = {};
    connections['read'][config.database] = mongoose.createConnection(`mongodb${config.isSrv ? '+srv' : ''}://${config.user}:${config.password}@${config.host}/${config.database}?retryWrites=true&w=majority&readPreference=secondaryPreferred`, { useCreateIndex: true, useNewUrlParser: true, useUnifiedTopology: true });
    connections[config.database] = mongoose.createConnection(`mongodb${config.isSrv ? '+srv' : ''}://${config.user}:${config.password}@${config.host}/${config.database}?retryWrites=true&w=majority`, { useCreateIndex: true, useNewUrlParser: true, useUnifiedTopology: true });
    return connections[config.database];
};

const createConnections = configs => configs.reduce((promise, config) => createConnection(config));

const getConnectionByString = connectionString => mongoose.createConnection(connectionString, { useCreateIndex: true, useNewUrlParser: true, useUnifiedTopology: true });

const getConnections = () => connections;

const getConnectionReadOnly = config => {
    if (connections['read'] && connections['read'][config.database])
        return connections['read'][config.database];
    return createConnection(config);
};

const getConnection = config => {
    if (!connections[config.database])
        return createConnection(config);
    return connections[config.database];
};

const terminateConnection = database => {
    if (!connections[database])
        throw new Error(`Connection does not exist for database ${database}`);

    // TODO Test termination
    return connections[database].close();
};
module.exports = {
    connect: createConnection,
    getConnection,
    getConnectionReadOnly,
    getConnections,
    createConnections,
    terminateConnection,
    getConnectionByString,
    MongoWatcher
};
