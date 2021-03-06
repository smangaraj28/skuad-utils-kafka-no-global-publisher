'use strict';

let json2csv = require('json2csv');
const Json2csvTransform = json2csv.Transform;
const stream = require('stream');
const { Readable } = stream;
const fs = require('fs');
let s3 = require('../../apiWrappers/aws').S3;

let csvHelper = {

    getReadJsonStream(data) {
        const inStream = new Readable({
            read() {
            },
        });
        // logger.info(`Data to be transformed`);
        // logger.info(`${data}`);
        let string = '';
        try {
            string = JSON.stringify(data)
        } catch (e) {
            console.log(e)
        }
        inStream.push(string);
        inStream.push(null); // No more data
        return inStream;
    },
    getCsvTransformStream(fields) {
        const opts = {
            fields: fields,
            header: true,
            // delimiter: '\t'
        };
        const transformOpts = {highWaterMark: 16384, encoding: 'utf-8'};
        const json2csvStream = new Json2csvTransform(opts, transformOpts);
        return json2csvStream;
    },
    getWriteStream(outputPath){
        let opts = {
            encoding: 'utf8'
        };
        return fs.createWriteStream(outputPath, opts);
    },
    uploadFileStream(fileInputPath, s3UploadPath,bucketName = global.Config.aws.s3.uploadsBucket){
        let body = fs.createReadStream(fileInputPath);

        return s3.uploadStreamOnPath(body, bucketName, '', s3UploadPath)
            .then(data => {
                // logger.info(`[s3Helper][uploadFileStream] File(${s3UploadPath}) uploaded successfully: ${JSON.stringify(data)}`);
                return Promise.resolve(data);
            })
            .catch(err => {
                // logger.error(`[s3Helper][uploadFileStream] File(${s3UploadPath}) upload failed: ${err}`);
                return Promise.reject(err);
            });
    },

    getLocalFilePath(syncData){
        let date = new Date();
        let timestamp = date.getTime();

        let panel = 'default_panel';
        if (syncData.panel)
            panel = syncData.panel;

        let Id = 'default_id';
        if (syncData.user_id)
            Id = syncData.user_id;

        let apiName = 'default_api_name';
        if (syncData.apiName)
            apiName = syncData.apiName;

        return `/tmp/${Id}_${syncData.apiName}_${timestamp}.csv`;
    },
    getS3FilePath(syncData){
        let date = new Date();
        let timestamp = date.getTime();

        let panel = 'default_panel';
        if (syncData.panel)
            panel = syncData.panel;

        let Id = 'default_id';
        if (syncData.user_id)
            Id = syncData.user_id;

        let apiName = 'default_api_name';
        if (syncData.apiName)
            apiName = syncData.apiName;

        return `${panel}/${Id}/${syncData.apiName}/${Id}_${syncData.apiName}_${timestamp}.csv`;
    }

};

module.exports = csvHelper;
