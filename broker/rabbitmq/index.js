'use strict';

const RabbitMqClient = require('./RabbitMQClient');
const Queues = require('../queues');
const Config = global.Config;

let rabbitClients = [];
let publisherClient = null;

publisherClient = new RabbitMqClient({
    queueName: 'publisher-queue',
    noOfRetriesOnError: 0,
    handlers: {
        callback: function() {
        },
    },
    connectionString: Config.broker && Config.broker.rabbitmq
});

module.exports = {
    listenQueue: function listenQueue(queueName, callback, properties = {}) {
        let rabbitMQClient = new RabbitMqClient({
            queueName,
            handlers: {
                callback,
            },
            connectionString: properties.connectionString || Config.rabbitmq.connectionString,
            queueProperties: properties.queueProperties || {},
            consumerProperties: properties.consumerProperties || {},
            noOfRetriesOnError: properties.noOfRetriesOnError || 0,
            prefetch: properties.prefetch || 5,
            logger: properties.logger
        });

        return rabbitMQClient.registerConsumer()
            .then(function() {
                rabbitClients.push(rabbitMQClient);
            });

        // return tryUntilSuccess(function() {});
    },

    pushToQueue: function(queueName, message, options = {}) {
        if (options.noOfRetries === undefined) {
            options.noOfRetries = 0;
        }

        if (options.persistent === undefined) {
            options.persistent = true;
        }

        return publisherClient.pushToQueue(queueName, message, options);
    },

    rpc: function(queueName, message, options = {}) {
        // By default message in rpc mode are not made persistent
        // to make your message persistent send options.persistent = true
        return publisherClient.rpc(queueName, message, options);
    },

    stopConsumers: function() {
        publisherClient.onConnectionClose();
        publisherClient = null;

        rabbitClients.forEach(client => {
            client.onConnectionClose();
            client = null;
        });
    },

    RabbitMqClient,

    Queues
};
