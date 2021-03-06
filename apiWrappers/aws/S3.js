'use strict';

const Q = require('q');
const AwsSdk = require('aws-sdk');
const uuid = require('uuid');
const fs = require('fs');

const DEFAULT_EXPIRY = 60 * 15;

module.exports = class S3 {
    constructor(config) {
        if (!config.s3) {
            return;
        }
        this.config = config;
        this.s3Instance = new AwsSdk.S3({
            region: config.s3.bucketRegion
        });
    }

    uploadFile(filePath, params) {
        const stream = fs.createReadStream(filePath);
        return this.uploadStream(stream, {}, params);
    }

    uploadFileAdvanced(filePath, options, params) {
        throw new Error('PENDING IMPLEMENTATION');
    }

    getS3Stream( key, bucket) {
        let downloadBucket = bucket || global.Config.aws.s3BucketName;
        let params = {'Bucket': downloadBucket, 'Key': key};
        return this.s3Instance.getObject(params).createReadStream();
    }

    downloadS3File(bucket, source, destination) {
        const deferred = Q.defer();
        let dir = `${destination}`;
        dir = dir.split('/');
        dir.pop();
        fs.mkdirSync(dir.join('/'), {recursive: true});
        if (fs.existsSync(destination)) {
            deferred.reject(new Error('File already exists!!'));
        } else {
            let file = fs.createWriteStream(destination);
            try {
                const s3Reader = this.getS3Stream(source, bucket);
                s3Reader.on('error', (error) => {
                    deferred.reject(error);
                });
                s3Reader.pipe(file)
                    .on('error', (err) => {
                        deferred.reject(err);
                    })
                    .on('close', () => {
                        file.close();
                        deferred.resolve();
                    });
            } catch (e) {
                deferred.reject(e);
            }
        }
        return deferred.promise;
    }

    uploadStream(stream, options = {}, params) {
        /*
        TODO: Add validation to params
         */
        let deferred = Q.defer();

        const key = params.key || uuid.v4();

        this.s3Instance.upload({
            Bucket: params.bucket,
            Key: key,
            Body: stream,
            Metadata: {
                originalName: params.originalName || ''
            }
        }, options, (err, data) => {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    }

    getSignedUrl(operation, bucket, key, params = {}, signedUrlExpireSeconds = DEFAULT_EXPIRY) {
        return this.s3Instance.getSignedUrl(operation, {
            ...params,
            Bucket: bucket,
            Key: key || uuid.v4(),
            Expires: signedUrlExpireSeconds
        });
    }
};
