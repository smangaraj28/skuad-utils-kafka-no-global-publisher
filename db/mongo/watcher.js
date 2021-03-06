'use strict';
const pauseable = require('pauseable');
const async = require('async');
const {Cache} = require('../cache');
const mongoose = require('mongoose');
const { Timestamp } = require('mongodb');

/**
 * #Note: Single collection cannot have multiple watchers for the same use-case.
 *        Watcher/Streaming is not a horizontally scalable architecture.
 */
module.exports = class MongoWatcher {
    /**
     * @param props:
     *          db: mongodb client object
     *          serviceName: name of the Service watcher is being used
     *          collectionName: mongo collection name
     *          ttl: TTL for redis key
     */
    constructor(props ={}) {
        this.watcherStateSchema = new mongoose.Schema({
            _id: { type: mongoose.Schema.ObjectID },
            serviceName: {type:String, required: true},
            collectionName: {type:String, required: true},
            resumeToken: {type:String, required: true}
        }, {
            timestamps: true
        });
        this.watcherState = props.db.model('watcher_state', this.watcherStateSchema, 'watcher_state');
        this.serviceName = props.serviceName;
        this.collectionName = props.collectionName;
        this.pause = false;
        this.logger = Logger.getInstance({
            module: `${this.serviceName}-${this.collectionName}-mongo-watcher`
        });
        this.redisKey = `${this.serviceName}:${this.collectionName}`;
        this.redisTtl = props.ttl; // timeInSeconds
        this.dbCounter = 0;
        this.resume_token = null;
        this.resumeTokenId = null;
    }

    async setResumeTokenForService() {
        this.resume_token = await this.getResumeTokenFromRedis();
        if (!this.resume_token) {
            this.resume_token = await this.getResumeTokenFromDB();
        }
    }

    getResumeTokenFromRedis() {
        return Cache.get(this.redisKey);
    }

    setResumeTokenToRedis() {
        if (this.redisTtl)
            return Cache.set_with_ttl(this.redisKey, this.resume_token, this.redisTtl);
        return Cache.set(this.redisKey, this.resume_token);
    }

    /**
     * Mongo collection named: 'watcher_state' is required
     * Schema:
     *      id: ObjectID
     *      serviceName: String
     *      collectionName: String
     *      resumeToken: String
     *      createdAt: Date
     *      updatedAt: Date
     */
    getResumeTokenFromDB() {
        let watcherStateObj = null;
        if(this.resumeTokenId) {
            watcherStateObj = this.watcherState.findById(this.resumeTokenId, 'resumeToken');
        } else {
            watcherStateObj = this.watcherState.findOne({
                serviceName: this.serviceName,
                collectionName: this.collectionName
            });
            if (watcherStateObj && watcherStateObj['_id']) this.resumeTokenId = watcherStateObj['_id'];
        }
        if(watcherStateObj && watcherStateObj['resumeToken']) {
            return watcherStateObj['resumeToken'];
        }
        return null;
    }

    async setResumeTokenToDB() {
        if(this.resumeTokenId) {
            return this.watcherState.findByIdAndUpdate(this.resumeTokenId, {resumeToken: this.resume_token});
        } else {
            return this.watcherState.findOneAndUpdate({
                serviceName: this.serviceName,
                collectionName: this.collectionName
            }, {resumeToken: this.resume_token});
        }
    }

    /**
     *
     * @param dbCollection          : mongoose Model
     * @param callback              : Business logic
     * @param maxQueueSize          : In-memory queue size for back-pressure
     * @param maxParallelHandles    : parallel executions within queue
     * @returns {Promise<void>}
     */
    async watchCollection(dbCollection, callback, maxQueueSize = 5000, maxParallelHandles= 1) {
        if (!this.resume_token){
            await this.setResumeTokenForService();
        }

        const colWatcher = this.resume_token ?
            dbCollection.watch([], {resumeAfter: this.resume_token}) :
            dbCollection.watch([], {startAtOperationTime: Timestamp(0, Math.floor((new Date().getTime() + (7 * 24 * 60 * 60 * 1000))/ 1000))});

        const msgQueue = async.queue(async (data, done) => {
            let promise = callback(data);
            await promise.catch(error => {
                this.logger.error(error, `Error watching collection`);
            });
            this.resume_token = data._id;
            done();
        }, maxParallelHandles);

        colWatcher.on('change', (data) => {
            try {
                msgQueue.push(data);
                if (msgQueue.length() > maxQueueSize) {
                    pauseable.pause(colWatcher);
                    this.pause = true;
                }
            }
            catch(e) {
                this.logger.error(data, `Error handling message: ${e}`);
            }
        });
        colWatcher.on('error', err => {
            this.logger.error(err, 'Error in watcher');
            pauseable.setTimeout(
                this.watchCollection(dbCollection, callback, maxQueueSize = 500, maxParallelHandles= 500),
                5000);
        });

        msgQueue.drain = async () => {
            await this.setResumeTokenToRedis();
            this.dbCounter = this.dbCounter + 1;
            if(this.dbCounter === 10) {
                await this.setResumeTokenToDB();
            }
            if (this.pause) {
                pauseable.resume(colWatcher);
                this.paused = false;
            }
        };

    }

};
