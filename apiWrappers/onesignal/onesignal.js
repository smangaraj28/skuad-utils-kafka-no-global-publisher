'use strict';

const Q = require('q');
const request = require('request');
const { BadRequest } = require('../../util/errors');

const {apiBase, appId, apiKey} = global.Config.onesignal || {};

class OneSignal {

    constructor(props) {
        if (!props.logger) {
            throw new Error('logger is required');
        }
        this.logger = props.logger;
    }

    sendNotification(userIds, playerIds, segments, body, data) {
        if((userIds && !Array.isArray(userIds))
            || (playerIds && !Array.isArray(playerIds))
            || (segments && !Array.isArray(segments))
            || !body) {
            throw new BadRequest('Invalid params');
        }

        let config = {
            uri: '/notifications',
            json: {
                app_id: appId,
                contents: {
                    en: body.contents,
                },
                headings: {
                    en: body.title,
                }
            },
            method: 'post'
        };

        if(segments) {
            segments = segments.map(segment => {
                return OneSignal.SEGMENTS[segment]
            });
            config.json.segments = segments;
        }

        if(userIds) {
            config.json.include_external_user_ids = userIds
        }

        if(playerIds) {
            config.json.include_player_ids = playerIds;
        }

        if(data) {
            config.json.data = data;
        }
        return makeRequest(config, this.logger)
            .then(result => {
                let invalid_external_user_ids = [];
                if(result) {
                    if(result.errors) {
                        this.logger.error(result.errors);
                        invalid_external_user_ids = result.errors.invalid_external_user_ids
                    } else {
                        this.logger.info(`Recipients: ${result.recipients}`);
                    }
                }
                return {
                    invalid_external_user_ids,
                    errors: result.errors
                };
            })
    }

}

OneSignal.SEGMENTS ={
    SUBSCRIBED_USERS: 'Subscribed Users',
    ACTIVE_USERS: 'Active Users',
    ENGAGED_USERS: 'Engaged Users',
    INACTIVE_USERS: 'Inactive Users',
    TEST_USERS: 'Test users'
};


function makeRequest(config = {}, logger) {
    const deferred = Q.defer();

    config.baseUrl = apiBase;
    config.headers = config.headers || {};
    config.headers['Accept'] = 'application/json';
    config.headers['Content-Type'] = 'application/json';
    config.headers['Cache-Control'] = 'no-cache';
    config.headers['Authorization'] = `Basic ${apiKey}`;

    request(config, (err, response, body) => {
        if (err) {
            deferred.reject(err);
        } else {

            if (response.statusCode === 200 || response.statusCode === 201) {
                deferred.resolve(body);
            } else {
                logger.error({body}, 'One signal error response');
                deferred.reject(body);
            }
        }
    });

    return deferred.promise;
}

module.exports = OneSignal;
