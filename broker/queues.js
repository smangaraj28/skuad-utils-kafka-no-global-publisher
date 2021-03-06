'use strict';

const uuid = require('uuid');

let Queues = {};

Queues.SKUAD_EVENTS = {
    queueName: 'skuad-events-' + global.Config.env,
    // supportedVerbs: [
    //     'create',
    //     'forgot',
    //     'update',
    //     'invoke',
    //     'status',
    //     'reset',
    //     'delete',
    //     'success',
    //     'failed',
    //     'expired',
    //     'paid',
    //     'queued',
    //     'sendotp',
    //     'state'
    // ],
    getMessageObject: (actor, verb, object, target, loggerContext, noAudit) => {
        if (!actor || typeof actor !== 'object') {
            throw new Error(`actor cannot be null`);
        }
        if (!actor.type || !actor.id) {
            throw new Error(`actor object must have type and id, currently ${JSON.stringify(actor)}`);
        }
        if (!object || typeof object !== 'object') {
            throw new Error(`object cannot be null or has to be an object type`);
        }
        if (!verb) {
            throw new Error(`verb is required`);
        }
        // if (Queues.SKUAD_EVENTS.supportedVerbs.indexOf(verb) === -1) {
        //     throw new Error(`Unsupported verb ${verb}`)
        // }
        // if (!loggerContext) {
        //     throw new Error('loggerContext is required');
        // }

        return {
            eventId: uuid.v4(),
            published: new Date().toISOString(),
            actor,
            noAudit,
            object,
            target,
            verb,
            loggerContext
        }
    }
};

Queues.ELASTIC_CRUDS = {
    queueName: 'zs-audit-' + global.Config.env
};

Queues.USER_PROGRESS = {
    queueName: 'zs-progress-' + global.Config.env
};

Queues.ZS_CONTENT = {
    queueName: 'zs-content-' + global.Config.env
};

Queues.ZS_ASSESSMENT = {
    queueName: 'zs-assessment-' + global.Config.env
};

Queues.ZS_KELAS = {
    queueName: 'zs-kelas-' + global.Config.env
};

Queues.ZS_GOOGLE_CLASSROOM = {
    queueName: 'zs-google-classroom-' + global.Config.env
};

Queues.ZS_USER = {
    queueName: 'zs-user-' + global.Config.env
};

Queues.ZS_CAMPAIGN = {
    queueName: 'zs-campaign-' + global.Config.env
};

Queues.ZS_ORDER = {
    queueName: 'zs-order-' + global.Config.env
};

Queues.ZS_WALLET = {
    queueName: 'zs-wallet-' + global.Config.env
};

Queues.ZS_ISSUE = {
    queueName: 'zs-issue-' + global.Config.env
};

Queues.SEND_EMAIL_CONSUMER = {
    queueName: 'send_email'
};

Queues.SEND_NOTIFICATION_CONSUMER = {
    queueName: 'send_notification'
};

module.exports = Queues;
