'use strict';

const bunyan = require('bunyan');
const {v4} = require('uuid');
const bunyanFormat = require('bunyan-format');
const Config = global.Config;
const Serializers = require('./serializers');

const logger = bunyan.createLogger({
    name: Config.logger && Config.logger.name || 'logger',
    serializers: Serializers,
    streams: [{
        level: bunyan.levelFromName['info'],
        stream: bunyanFormat({
            outputMode: Config.logger.output || 'short',
            levelInString: true
        }, null)
    }]
});

logger.on('error', (err) => {
    console.log(err)
});

logger.__proto__.getContext = function () {
    return {
        'x-request-id': this.fields['x-request-id'],
        'x-b3-traceid': this.fields['x-b3-traceid'],
        'x-b3-spanid': this.fields['x-b3-spanid'],
        'x-b3-parentspanid': this.fields['x-b3-parentspanid'],
        'x-b3-sampled': this.fields['x-b3-sampled'],
        'x-b3-flags': this.fields['x-b3-flags'],
        'x-ot-span-context': this.fields['x-ot-span-context'],
    }
};

module.exports = {
    getInstance: (props = {}) => {
        if (typeof props === 'string') {
            props = JSON.parse(props);
        }
        let parentContext = {};
        if (props.loggerContext) {
            parentContext = props.loggerContext;
            delete props.loggerContext;
        }
        let properties = Object.assign({
            'x-request-id': v4(),
        }, props, parentContext);
        return logger.child(properties);
    }
};

