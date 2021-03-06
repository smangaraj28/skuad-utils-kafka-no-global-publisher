'use strict';

const KafkaClient = require('./KafkaClient');
const Queues = require('../queues');
const Config = global.Config;

let kafkaClients = [];
let publisherClient = null;

function getPublisherClient() {
    if (publisherClient) return publisherClient;
    publisherClient = new KafkaClient({
        topics: ['publisher-topic'],
        handlers: {
            callback: function () {
            },
        },
        hostname: Config.broker && Config.broker.kafka
    });
    return publisherClient;

}

module.exports = {
    listenQueue: function listenQueue(topics, callback, properties = {}) {
        let kafkaClient = new KafkaClient({
            topics,
            handlers: {
                callback,
            },
            hostname: properties.hostname || Config.broker.kafka.hostname,
            queueProperties: properties.queueProperties || {},
            consumerProperties: properties.consumerProperties || {},
            logger: properties.logger
        });

        return kafkaClient.registerConsumer()
            .then(function() {
                kafkaClients.push(kafkaClient);
            });
    },

    pushToQueue: function(topics, message, options = {}) {
        if (options.attributes === undefined) {
            options.attributes = 1;
        }

        return getPublisherClient().pushToQueue(topics, message, options);
    },

    stopConsumers: function() {
        publisherClient.closeConnection();
        publisherClient = null;

        kafkaClients.forEach(client => {
            client.closeConnection();
            client = null;
        });
    },
    KafkaClient,
    Queues
};
