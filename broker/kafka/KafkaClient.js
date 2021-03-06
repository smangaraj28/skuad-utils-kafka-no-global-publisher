'use strict';

const Q = require('q');
const kafka = require('node-rdkafka');
const UUID = require('uuid');
const Logger = require('../../logger');
const async = require('async');
const commitManager = require('./commitManager');

const defaultConstructorProps = {
    // Name of the topics
    topics: [],

    logger: Logger.getInstance({
        module: 'Kafka'
    }),

    // handlers get passed the callbacks to handle events like error, close, consumer callback
    handlers: {
        // callback is the function which is called when a message is received on a consumer.
        // It should return a promise, CONSUMER_HANDLER_NOT_PROMISE error will be thrown,
        // however message will be processed
        callback: null,

        // function to execute if connection close event is raised
        onConnectionClose: null,

        // function to execute if connection error event is raised
        onConnectionError: null,
    }
};

const defaultProducerOptions = {
    requireAcks: false,
    // ackTimeoutMs: 1000,
    noAckBatchSize: 5000000, //5 MB
    noAckBatchAge: 5000 // 5 Sec
};

const defaultConsumerOptions = {
    // fetchMaxWaitMs: 1000,
    // fetchMaxBytes: 10 * 1024 * 1024, // 10 MB
    rebalance_cb: null,
    'enable.auto.commit': false
};

class KafkaClient {
    constructor(props = {}) {
        props = Object.assign({}, defaultConstructorProps, props);
        this.consumerProperties = Object.assign({}, defaultConsumerOptions, props.consumerProperties || {});
        this.producerProperties = Object.assign({}, defaultProducerOptions, props.queueProperties || {});

        /*
        TODO: Add validations
         */

        this.hostname = props.hostname;
        this.topics = props.topics;
        this.logger = Logger.getInstance({
            module: props.queueName
        });
        this.handlers = props.handlers;
        this.paused = false;

        if (!this.handlers.callback || (this.handlers.callback.constructor.name !== 'Function' && this.handlers.callback.constructor.name !== 'AsyncFunction')) {
            throw new Error(`Queue callback should be a function - ${this.handlers.callback} provided`);
        }

        if (!this.consumerProperties.rebalance_cb) {
            this.consumerProperties.rebalance_cb = this.onRebalance.bind(this)
        }

        this.connection = null;
        this.connectionDeferred = null;

        this.consumer = null;
        this.consumerDeferred = null;

        this.publisher = null;
        this.publisherDeferred = null;

        this.msgQueue = null;

    }

    /*
        Establish Connection With ZooKeeper / Kafka server and cache it
        this.hostname holds the server address, login credentials etc
    */
    getConnection(isBatchProducer) {
        let deferred = Q.defer();

        if (this.connection) {
            deferred.resolve(this.connection);
        } else if (this.connectionDeferred && this.connectionDeferred.promise.inspect().state === 'pending') {
            return this.connectionDeferred.promise;
        } else {
            this.connectionDeferred = deferred;

            try {
                if(isBatchProducer) {
                    this.connection = new kafka.KafkaClient(this.hostname, 'producer-node',
                        {}, {
                            noAckBatchSize: 5000000, //5 MB
                            noAckBatchAge: 5000 // 5 Sec
                        });
                } else {
                    this.connection = new kafka.KafkaClient(this.hostname);
                }
                this.logger.info('Queue connection created');

                this.connection.on('error', this.onConnectionError.bind(this));
                this.connection.on('close', this.onConnectionClose.bind(this));

                this.connectionDeferred.resolve(this.connection);
                deferred.resolve(this.connection);
            } catch(error) {
                this.logger.error(error, 'Error connecting to kafka server');

                // TODO replace deferred.reject(error) with
                // deferred.resolve(self.getConnection()) along with number of retries logic
                this.connectionDeferred.reject(error);
            }
        }

        return deferred.promise;
    }

    /*
     Establish a consumer on the connected kafka server and cache it
    */
    getConsumer() {
        let deferred = Q.defer();

        if (this.consumer) {
            deferred.resolve(this.consumer);
        } else if (this.consumerDeferred && this.consumerDeferred.promise.inspect().state === 'pending') {
            return this.consumerDeferred.promise;
        } else {
            this.consumerDeferred = deferred;
            const consumer = new kafka.KafkaConsumer(this.consumerProperties);

            consumer.on('ready', (arg) => {
                this.logger.info(arg, 'consumer ready.');
                consumer.subscribe(this.topics);
                consumer.consume();
                this.consumer = consumer;
                this.logger.info('Queue consumer created');
                commitManager.start(consumer, this.logger);
                deferred.resolve(consumer);
            });

            consumer.on('event.log', this.onDebugLog.bind(this));

            consumer.on('event.error', (err) => {
                if(deferred.promise.inspect().state === 'pending') {
                    deferred.reject(err);
                }
                this.onConsumerError(err);
            });
            consumer.on('close', this.onConsumerClose.bind(this));

            consumer.connect();

        }

        return deferred.promise;
    }

    /*
        Register a consumer on established topic
        Topic name and callback functions are defined in class constructor
    */
    registerConsumer() {
        let deferred = Q.defer();
        this.getConsumer()
            .then((consumer) => {
                const msgQueue = async.queue(async (data, done) => {
                    await this.processMessage(data);
                    commitManager.notifyFinishedProcessing(data);
                    done();
                }, global.Config.broker.kafka.maxParallelHandles);
                this.msgQueue = msgQueue;

                consumer.on('data', (data) => {
                    try {
                        commitManager.notifyStartProcessing(data);

                        msgQueue.push(data);
                        if (msgQueue.length() > global.Config.broker.maxQueueSize) {
                            consumer.pause(consumer.assignments());
                            this.paused = true;
                        }
                    }
                    catch(e) {
                        this.logger.error(`Error handling message: ${e}`);
                    }
                });

                this.logger.info(`Consumer registered on topic '${this.topics.join(',')}'`);

                msgQueue.drain = async () => {
                    if (this.paused) {
                        consumer.resume(consumer.assignments());
                        this.paused = false;
                    }
                };
                deferred.resolve();
            }).catch((error) => {
            this.logger.error(error, `Error registering consumer on topic '${this.topics.join(',')}'`);
            deferred.reject(error);
        });
        return deferred.promise;
    }

    /*
     Establish a publisher on the connected kafka server and cache it
    */
    getPublisher() {
        let deferred = Q.defer();
        /*if (this.publisher) {
            deferred.resolve(this.publisher);
        } else if (this.publisherDeferred && this.publisherDeferred.promise.inspect().state === 'pending') {
            return this.publisherDeferred.promise;
        } else {
            this.publisherDeferred = deferred;*/
            const producerConfig = {
                // 'debug': 'all',
                "metadata.broker.list": global.Config.broker.kafka.hostname,
                dr_cb: true,
            };
            if (
                global.Config.broker.kafka.brokerUsername &&
                global.Config.broker.kafka.brokerPassword
            ) {
                producerConfig["security.protocol"] = "SASL_SSL";
                producerConfig["sasl.mechanisms"] = "PLAIN";
                producerConfig["sasl.username"] =
                    global.Config.broker.kafka.brokerUsername;
                producerConfig["sasl.password"] =
                    global.Config.broker.kafka.brokerPassword;
            }
            const publisher = new kafka.Producer(producerConfig);
            publisher.on('event.log', (log) => {
                this.logger.debug(log);
                publisher.disconnect();
            });
            publisher.on('event.error', (err) => {
                if (deferred.promise.inspect().state === 'pending') {
                    deferred.reject(err);
                }
                this.onPublisherError(err);
            });
            publisher.setPollInterval(100);
            publisher.on('ready', (arg) => {
                //this.publisher = publisher;
                deferred.resolve(publisher);
            });

            publisher.on('delivery-report', (err, report) => {
                // The offset if our acknowledgement level allows us to receive delivery offsets
                if (err) {
                    throw err;
                }
                this.logger.info({data: report});

            });

            publisher.on('disconnected', (arg) => {
                this.publisher = null;
                this.publisherDeferred = null;
            });

            publisher.connect();
        //}

        return deferred.promise;
    }

    /*
        Push message to specified topic
        @option
            - partition: Number
            - key: String           - Message Key (Same key messages will be sent to same partitions)
    */
    pushToQueue(topicName, message, options = {}) {
        return this.getPublisher()
            .then((publisher) => {
                const buffer = new Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));

                this.logger.debug(message,'Sending record: ');

                let deferredRes = Q.defer();
                //Send record to Kafka and log result/error
                const resp = publisher.produce(topicName, options.partition, buffer, options.key, Date.now(), "", []);
                if (resp) {
                    deferredRes.resolve(resp);
                }
                else {
                    // TODO retry logic starts here
                    deferredRes.reject(resp);
                }
                return deferredRes.promise;
            })
            .then(result => {
                this.logger.info(`Message Pushed To Queue ${topicName}`);
                return result;
            })
            .catch(error => {
                this.logger.error({
                    err: error,
                    params: {
                        message,
                        topicName,
                    },
                }, 'Message send to topic error');
                throw error;
            });
    }

    processMessage(message) {
        let deferred = Q.defer();

        let promise;
        let acked = false;
        let timeout = null;

        try {
            // Read string into a buffer.
            let buf = new Buffer.from(message.value, "binary");

            message['content'] = buf.toString();
            message.content = JSON.parse(buf.toString());
            promise = this.handlers.callback(message)
        } catch (e) {
            this.logger.error({
                err: e,
                params:  message.content,
            }, 'Error delivering message to consumer');

            process.nextTick(() => {
                if (!this.consumerProperties['enable.auto.commit'] && !acked) {
                    this.retryFailedMessage(message);
                    acked = true;
                }
                deferred.reject(e);
            });

            return deferred.promise;
        }

        if (!promise || !promise.inspect || promise.constructor.name !== "Promise") {
            if (!this.consumerProperties['enable.auto.commit'] && !acked) {
                this.retryFailedMessage(message);
                acked = true;
            }
            let error = new Error(`'${this.topics.join(',')}' handler is not a promise`);
            process.nextTick(() => {
                deferred.reject(error);
            });
            return deferred.promise;
        }

        // Adding timeout to ack the message if this is taking too much time
        // If a message is taking too much time and the consumer restarts, this message will be delivered again
        // This functionality is arguable.
        if (!this.consumerProperties['enable.auto.commit']) {
            // set timeout iff the consumer will explicitly ack
            timeout = setTimeout(() => {
                timeout = null;
                if (promise.inspect().state === 'pending') {
                    if (!this.consumerProperties['enable.auto.commit'] && !acked) {
                        this.retryFailedMessage(message);
                    }
                    if (!acked) {
                        acked = true;
                        this.logger.error({
                            params: message.content,
                            err: new Error(`Timed out processing message on Topics ->> '${this.topics.join(',')}'`),
                        }, `Timed out processing message on Topics ->> '${this.topics.join(',')}'`);
                    }
                }
            }, global.Config.broker.kafka.messageProcessingTimeoutMS);
        }

        promise.then(result => {

            // if this was a rpc call and the caller is waiting for response
            // TODO check for Kafka RPC
            // this.sendMessageToRPCConsumer(message, {
            //     success: true,
            //     data: result,
            // });

            deferred.resolve(result);
        }).catch(error => {
            clearTimeout(timeout);
            this.logger.error(error, `Error processing message on topic '${this.topics.join(',')}'`);
            if (!this.consumer) {
                return this.onConsumerClose();
            }

            if (!this.consumerProperties['enable.auto.commit'] && !acked) {
                this.retryFailedMessage(message);
                acked = true;
            }

            // if this was a rpc call and the caller is waiting for response
            // this.sendMessageToRPCConsumer(message, {
            //     success: false,
            //     error: this.logger.serializers.err(error),
            // });

            deferred.reject(error);
        }).finally(() => {
            // clear timeout so that it is not fired now
            clearTimeout(timeout);
        });

        return deferred.promise;
    }

    retryFailedMessage(message) {
        // TODO Retry Consumer to be in-built
        let failedTopics = this.topics.filter(t => !t.startsWith('failed_')).map(t => 'failed_' + t);
        // let failedTopics = this.topics.filter(t => t.startsWith('retry_')).map(t => t.replace('retry_','failed_'));
        if (failedTopics.length) {
            // TODO Push to Queue logic
            // return this.pushToQueue(failedTopics, message, this.producerProperties);
        }
    }

    onRebalance(err, assignments) {
        if (err.code === kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS) {
            this.consumer.assign(assignments);
        } else if (err.code === kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
            if (this.paused) {
                this.consumer.resume(assignments);
                this.paused = false;
            }
            this.msgQueue.remove((d, p) => { return true; });
            this.consumer.unassign();
            commitManager.onRebalance();
        } else {
            this.logger.error(`Rebalace error : ${err}`);
        }
    }

    onConnectionError(error) {
        this.logger.error(error, 'Queue connection error');
        if (this.handlers.onConnectionError) {
            return this.handlers.onConnectionError(error);
        }
    }

    onConnectionClose() {
        this.connection = null;
        this.consumer = null;
    }

    onDebugLog(arg) {
        this.logger.info(arg, 'Queue consumer error');
    }

    onConsumerError(error) {
        this.logger.error(error, 'Queue consumer error');
    }

    onConsumerClose() {
        this.logger.info(`Kafka consumer closed on topic ${this.topics.join(',')}`);

        // Purge the existing consumer info so that fresh instance is created.
        this.consumer = null;

        // A consumer might close if there is an unhandled error while processing message in consumer.
        // It can also close if the underlying Kafka connection is closed.
        // So creating a new consumer might fail again.
        // Therefore, instead of creating a new consumer. We will close the underlying connection.
        // The connection close handler will start everything again.
        if (this.connection !== null) {
            try {
                this.connection.close();
            } catch (e) {
                process.exit(1);
            }
        }
    }

    onPublisherError(error) {
        this.logger.error(error, 'Queue publisher error');
    }

    closeConnection() {
        try {
            if (this.consumer) {
                this.consumer.close();
            }
            this.consumer = null;
            this.connection.close();
            this.connection = null;
        } catch (e) {
            this.logger.error(e);
        }
    }
}

module.exports = KafkaClient;
