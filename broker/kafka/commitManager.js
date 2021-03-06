const COMMIT_TIME_INTERVAL = global.Config.broker && global.Config.broker.kafka.commitTimeInterval;

class CommitManager {

    constructor(props) {
        this.logger = null;
        this.partitionsData = {};
        this.lastCommited = [];
    }

    start(consumer, logger) {
        this.logger = logger;
        this.consumer = consumer;
        setInterval(() => {
            this.commitProcessedOffsets();
        }, COMMIT_TIME_INTERVAL)
    }

    notifyStartProcessing(data) {
        const partition = data.partition;
        const offset = data.offset;
        const topic = data.topic;
        this.partitionsData[partition] = this.partitionsData[partition] || [];
        this.partitionsData[partition].push({
            offset: offset,
            topic: topic,
            done: false
        });
    }

    notifyFinishedProcessing(data) {
        const partition = data.partition;
        const offset = data.offset;
        this.partitionsData[partition] = this.partitionsData[partition] || [];
        let record = this.partitionsData[partition].filter(
            (record) => { return record.offset === offset }
        )[0];
        if (record) {
            record.done = true;
        }
    }

    async commitProcessedOffsets() {
        try {
            let offsetsToCommit = [];
            for (let key in this.partitionsData) {
                let pi = this.partitionsData[key]
                    .findIndex((record) => { return record.done }); // last processed index
                let npi = this.partitionsData[key]
                    .findIndex((record) => { return !record.done }); // first unprocessed index
                let lastProcessedRecord = npi > 0 ?
                    this.partitionsData[key][npi - 1] :
                    (pi > -1 ?
                        this.partitionsData[key][this.partitionsData[key].length - 1] :
                        null
                    );
                if (lastProcessedRecord) {
                    offsetsToCommit.push({
                        partition: key - 0,
                        offset: lastProcessedRecord.offset,
                        topic: lastProcessedRecord.topic
                    });
                    // remove commited records from array
                    this.partitionsData[key]
                        .splice(0, this.partitionsData[key].indexOf(lastProcessedRecord) + 1);
                }
            }

            if (offsetsToCommit.length > 0) {
                this.logger && this.logger.info(offsetsToCommit, "Initiating Commits");
                this.consumer.commit(offsetsToCommit);
            }

            this.lastCommited = offsetsToCommit.length > 0 ?
                offsetsToCommit :
                this.lastCommited;
            Promise.resolve();
        }
        catch (e) {
            Promise.reject(e)
        }
    }

    onRebalance() {
        this.partitionsData = {};
    }

    getLastCommited() {
        return this.lastCommited;
    }
}

module.exports = new CommitManager();