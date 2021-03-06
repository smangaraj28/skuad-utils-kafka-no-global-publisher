'use strict';

const Q = require('q');
const amqplib = require('amqplib');
const UUID = require('uuid');
const Logger = require('../../logger');

const defaultConstructorProps = {
    // Name of the queue
    queueName: '',

    // Object with keys durable, exclusive, autoDelete
    // default values are true, false, false
    queueProperties: {},

    // prefetch should be low for workers which have high memory consumption
    // if worker makes 3rd party api calls and returns prefetch should be high. This is not a general rule though
    prefetch: 2,

    logger: Logger.getInstance({
        module: 'RabbitMq'
    }),

    // handlers get passed the callbacks to handle events like error, close, consumer callback
    handlers: {
        // callback is the function which is called when a message is received on a consumer.
        // It should return a promise, CONSUMER_HANDLER_NOT_PROMISE error will be thrown,
        // however message will be processed
        callback: null,

        // function to execute if channel close event is raised
        onChannelClose: null,

        // function to execute if channel error event is raised
        onChannelError: null,

        // function to execute if connection close event is raised
        onConnectionClose: null,

        // function to execute if connection error event is raised
        onConnectionError: null,
    },

    // number of retries that should happen if error is thrown
    noOfRetriesOnError: 0,
};

const defaultCallbackQueueProperties = {
    exclusive: true,
    durable: true,
    autoDelete: false,
    arguments: {
        expires: 1800000, // queue will get deleted post 30 minutes of no use
    },
};

const defaultQueueProps = {
    // if true, the queue will survive broker restarts
    durable: true,

    // if true, scopes the queue to the connection (defaults to false)
    exclusive: false,

    // if true, the queue will be deleted when the number of consumers drops to zero
    autoDelete: false,
};

const defaultConsumerProperties = {
    // set the value to true, if you don't want to acknowledge to the publisher that the message is processed
    // this should be set to true for message which are processed very quickly and loosing a message is not dangerous
    noAck: false,

    // If a consumer does processing fast, it should set low timeouts
    // Timeout doesn't stop the message from getting processed, it only nacks the message so that it is not redeliverd
    // on consumer restarts.
    messageProcessingTimeoutMS: 300000,

    rpcTimeoutMS: 300000,
};

class RabbitMQClient {
    constructor(props = {}) {
        props = Object.assign({}, defaultConstructorProps, props);
        this.consumerProperties = Object.assign({}, defaultConsumerProperties, props.consumerProperties || {});
        this.queueProperties = Object.assign({}, defaultQueueProps, props.queueProperties || {});

        /*
        TODO: Add validations
         */

        this.queueName = props.queueName;
        this.connectionString = props.connectionString;
        this.logger = Logger.getInstance({
            module: props.queueName
        });
        this.prefetch = props.prefetch;
        this.handlers = props.handlers;
        this.noOfRetriesOnError = props.noOfRetriesOnError;

        if (!this.handlers.callback || this.handlers.callback.constructor.name !== 'Function') {
            throw new Error(`Queue callback should be a function - ${this.handlers.callback} provided`);
        }

        this.connection = null;
        this.channel = null;

        this.connectionDeferred = null;
        this.channelDeferred = null;
    }

    /*
        Establish Connection With RabbitMQ server and cache it
        this.connectionString holds the server address, login credentials etc
    */
    getConnection() {
        let deferred = Q.defer();

        if (this.connection) {
            deferred.resolve(this.connection);
        } else if (this.connectionDeferred && this.connectionDeferred.promise.inspect().state === 'pending') {
            return this.connectionDeferred.promise;
        } else {
            this.connectionDeferred = deferred;

            amqplib.connect(this.connectionString)
                .then(result => {
                    this.logger.info('Queue connection created');
                    this.connection = result;

                    this.connection.on('error', this.onConnectionError.bind(this));
                    this.connection.on('close', this.onConnectionClose.bind(this));

                    this.connectionDeferred.resolve(this.connection);
                    deferred.resolve(this.connection);
                })
                .catch(error => {
                    this.logger.error(error, 'Error connecting to rabbitmq server');

                    // If you want to keep retrying the connection if it fails
                    // replace deferred.reject(error) with
                    // deferred.resolve(self.getConnection())
                    this.connectionDeferred.reject(error);
                });
        }

        return deferred.promise;
    }

    /*
     Establish a channel on the connected rabbitmq server and cache it
    */
    getChannel() {
        let deferred = Q.defer();

        if (this.channel) {
            deferred.resolve(this.channel);
        } else if (this.channelDeferred && this.channelDeferred.promise.inspect().state === 'pending') {
            return this.channelDeferred.promise;
        } else {
            this.channelDeferred = deferred;

            this.getConnection()
                .then(connection => {
                    return connection.createChannel();
                })
                .then(channel => {
                    this.logger.info('Queue channel created');
                    this.channel = channel;
                    this.channel.on('error', this.onChannelError.bind(this));
                    this.channel.on('close', this.onChannelClose.bind(this));
                    this.channel.prefetch(this.prefetch);
                    this.channelDeferred.resolve(channel);
                    deferred.resolve(channel);
                    return channel;
                });
        }

        return deferred.promise;
    }

    /*
        Register a consumer on established channel
        Queue name and callback functions are defined in class constructor
    */
    registerConsumer() {
        let deferred = Q.defer();

        this.getChannel()
            .then(() => {
                return this.channel.assertQueue(this.queueName, this.queueProperties);
            })
            .then(() => {
                return this.channel.consume(this.queueName, (message) => {
                    this.logger.info(`Message received on queue ${this.queueName}`);
                    this.processMessage(message);
                }, {
                    noAck: this.consumerProperties.noAck
                })
            })
            .then(() => {
                this.logger.info(`Consumer registered on queue ${this.queueName}`);
                deferred.resolve();
            })
            .catch(error => {
                this.logger.error(error, `Error registering consumer on queue ${this.queueName}`);
                deferred.reject(error);
            });

        return deferred.promise;
    }

    /*
        Push message to specified queue
    */
    pushToQueue(queueName, message, options = {}) {
        let deferred = Q.defer();

        this.getChannel()
            .then(() => {
                /*
                    queue properties below should not be default,
                    TODO: FIX this
                */
                return this.channel.assertQueue(queueName, defaultQueueProps);
            })
            .then(() => {
                return this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), options);
            })
            .then(result => {
                if (result !== true) {
                    let error = new Error('Send to queue failed');
                    this.logger.error({
                        err: error,
                        params: {
                            message,
                            queueName,
                        },
                    }, 'Message send to queue error');
                    deferred.reject(error);
                } else {
                    this.logger.info(`Message Pushed To Queue ${queueName}`);
                    deferred.resolve(result);
                }
            })
            .catch(error => {
                this.logger.error(error, 'Error pushing message to consumer');
                deferred.reject(error);
            });

        return deferred.promise;
    }

    processMessage(message) {
        let deferred = Q.defer();

        let promise;
        let acked = false;
        let timeout = null;

        try {
            message.content = message.content.toString();
            message.content = JSON.parse(message.content);
            promise = this.handlers.callback(message)
        } catch (e) {
            this.logger.error({
                err: e,
                params:  message.content,
            }, 'Error delivering message to consumer');

            process.nextTick(() => {
                if (!this.consumerProperties.noAck && !acked && message.fields) {
                    this.channel.nack(message, false, false);
                    acked = true;
                }
                deferred.reject(e);
            });

            return deferred.promise;
        }

        if (!promise || !promise.inspect) {
            if (!this.consumerProperties.noAck && !acked && message.fields) {
                this.channel.nack(message, false, false);
                acked = true;
            }
            let error = new Error(`${this.queueName} handler is not a promise`);
            process.nextTick(() => {
                deferred.reject(error);
            });
            return deferred.promise;
        }

        // Adding timeout to ack the message if this is taking too much time
        // If a message is taking too much time and the consumer restarts, this message will be delivered again
        // This functionality is arguable.
        if (!this.consumerProperties.noAck) {
            // set timeout iff the consumer will explicitly ack
            timeout = setTimeout(() => {
                timeout = null;
                if (promise.inspect().state === 'pending') {
                    if (!this.consumerProperties.noAck && !acked) {
                        this.channel.nack(message, false, false);
                        acked = true;
                        this.logger.error({
                            params: message.content,
                            err: new Error(`Timed out processing message on Queue ->> ${this.queueName}`),
                        }, `Timed out processing message on Queue ->> ${this.queueName}`);
                    }
                }
            }, this.consumerProperties.messageProcessingTimeoutMS);
        }

        promise.then(result => {
            if (!this.consumerProperties.noAck && !acked && message.fields) {
                this.channel.ack(message);
                acked = true;
            }

            // if this was a rpc call and the caller is waiting for response
            this.sendMessageToRPCConsumer(message, {
                success: true,
                data: result,
            });

            deferred.resolve(result);
        }).catch(error => {
            clearTimeout(timeout);
            this.logger.error(error, `Error processing message on queue ${this.queueName}'`);
            if (!this.channel) {
                return this.onChannelClose();
            }

            if (!this.consumerProperties.noAck && !acked && message.fields) {
                this.channel.nack(message, false, false);
                acked = true;
            }

            // if this was a rpc call and the caller is waiting for response
            this.sendMessageToRPCConsumer(message, {
                success: false,
                error: this.logger.serializers.err(error),
            });

            deferred.reject(error);
        }).finally(() => {
            // clear timeout so that it is not fired now
            clearTimeout(timeout);
        });

        return deferred.promise;
    }

    sendMessageToRPCConsumer(message) {
        // if this was a rpc call and the caller is waiting for response
        if (message.properties.replyTo) {
            this.logger.info(`Sending result from consumer to callback queue`);

            // Send message back to the callback queue so that RPC consumer can consume it.
            /* TODO: make this part better */
            return this.channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(message)), {
                correlationId: message.properties.correlationId,
            });
        }
    }

    rpc(queueName, message, options = {}) {
        if (options.rpcTimeoutMS === undefined) {
            options.rpcTimeoutMS = defaultConsumerProperties.rpcTimeoutMS;
        }

        let deferred = Q.defer();
        const correlationId = UUID.v4();
        let callbackQueue = '';
        let timedOut = false;

        let timeoutId = setTimeout(() => {
            if (deferred.promise.inspect().state === 'pending') {
                timedOut = true;
                let timeoutError = new Error('Response Time Out');
                this.logger.error({
                    err: timeoutError,
                    params: message,
                }, `Timedout while waiting for RPC response from queue ${queueName}`);
                deferred.reject(timeoutError);
            }
        }, options.rpcTimeoutMS);

        this.getChannel()
            .then(() => {
                // Assert queue for callback
                return this.channel.assertQueue('', defaultCallbackQueueProperties);
            })
            .then(assertedQueue => {
                callbackQueue = assertedQueue.queue;
                return this.channel.consume(callbackQueue, response => {
                    // Check the response for a correlationId match
                    if (response.properties.correlationId === correlationId && !timedOut) {
                        clearTimeout(timeoutId);

                        this.logger.info(`RPC response received from ${queueName}`);

                        response = JSON.parse(response.content.toString());

                        // Check if convention is being followed to return messages {"success": true, "data": {}}
                        if (response.success !== undefined) {
                            // If convention is followed then either reject or resolve based on response.
                            if (response.success === false) {
                                // In case of failures, send an error object.
                                deferred.reject(Object.assign(new Error(), response.error));
                            } else {
                                deferred.resolve(response.data);
                            }
                        } else {
                            // If convention is not followed then send the response as it is.
                            deferred.resolve(response);
                        }
                    }
                }, {noAck: true});
            })
            .then(() => {
                return this.channel.sendToQueue(queueName, new Buffer(JSON.stringify(message)), Object.assign({
                    correlationId: correlationId,
                    replyTo: callbackQueue,
                }, options));
            })
            .catch(error => {
                this.logger.error({err: error, params: message}, `Error while doing rpc to queue ${this.queueName}`);
                deferred.reject(error);
            });

        return deferred.promise;
    }

    onConnectionError(error) {
        this.logger.error(error, 'Queue connection error');
        if (this.handlers.onConnectionError) {
            return this.handlers.onConnectionError(error);
        }
    }

    onConnectionClose() {
        this.connection = null;
        this.channel = null;

        this.registerConsumer();
    }

    onChannelError(error) {
        this.logger.error(error, 'Queue channel error');
    }

    onChannelClose() {
        this.logger.info('AMQP channel closed');

        // Purge the existing channel info so that fresh instance is created.
        this.channel = null;

        // A channel might close if there is an unhandled error while processing message in consumer.
        // It can also close if the underlying rabbitMQ connection is closed.
        // So creating a new channel might fail again.
        // Therefore, instead of creating a new channel. We will close the underlying connection.
        // The connection close handler will start everything again.
        if (this.connection !== null) {
            try {
                this.connection.close();
            } catch (e) {
                process.exit(1);
            }
        }
    }

    closeConnection() {
        try {
            this.channel = null;
            this.connection.close();
            this.connection = null;
        } catch (e) {
            console.log(e);
        }
    }
}

module.exports = RabbitMQClient;
