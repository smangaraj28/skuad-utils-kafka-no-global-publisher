'use strict';

const BaseModel = require('./BaseModel');
const { CoreService } = require('../apiWrappers/core');

module.exports = class BaseUser extends BaseModel {
    constructor(props) {
        super(props);
        this.service = global.Config.services.user;
        this.resource = '/api/v1/user'
    }

    findByFirebaseId(firebaseId) {
        return CoreService.get(`${this.resource}/byFirebase/${firebaseId}`, null, {
            baseUrl: this.service,
            logger: this.logger
        })
    }

    findByEmail(email) {
        return CoreService.get(`${this.resource}/byEmail/${email}`, null, {
            baseUrl: this.service,
            logger: this.logger
        })
    }

    addMembership(firebaseUid, membership, options = {}) {
        if (options.headers && options.headers['authorization'])
            return CoreService.post(`${this.resource}/byFirebase/${firebaseUid}/membership`, membership, {
                baseUrl: this.service,
                logger: this.logger,
                ...options
            });
        return CoreService.post(`${this.resource}/membership`, { ...membership, uid: firebaseUid }, {
            baseUrl: this.service,
            logger: this.logger
        });
    }
    findAllByEmail(emails) {
        return CoreService.post(`${this.resource}/all/byEmail`, { emails }, {
            baseUrl: this.service,
            logger: this.logger
        })
    }

};
