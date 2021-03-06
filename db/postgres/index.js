'use strict';

const massive = require('massive');
const Q = require('q');

let connections = {};

function createConnection(config) {
    if(connections[config.database]){
        throw new Error(`Connection to ${config.database} has already been created`);
    }
    return massive(config)
        .then(instance => {
            connections[config.database] = instance;
            return connections[config.database];
        });
}

function createConnections(configs) {
    return configs.reduce((promise, config) => {
        return promise
            .then(() => {
                if(connections[config.database]){
                    throw new Error(`Connection to ${config.database} has already been created`);
                }
                return massive(config)
                    .then(instance => {
                        connections[config.database] = instance;
                        return connections[config.database];
                    });
            })
    }, Q())
}

function getConnections() {
    return connections;
}

function getConnection(database) {
    if(!connections[database]) {
        throw new Error(`Connection not created for database ${database}`);
    }
    return connections[database];
}

function terminateConnection(database) {
    if(!connections[database]) {
        throw new Error(`Connection does not exist for database ${database}`);
    }
    return connections[database].instance.$pool.end().then(() => {
        delete connections[database];
    });
}

module.exports = {
    connect: createConnection,
    createConnections,
    getConnections,
    getConnection,
    terminateConnection
};
