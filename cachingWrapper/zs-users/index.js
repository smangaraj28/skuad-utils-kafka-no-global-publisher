const ZsCache = {};
module.exports = ZsCache;

const {Cache} = require('../../db');
const LocalCache = require('../../db/cache/localCache');

const tenMinutes = 10 * 60;
const oneHour = 60 * 60;
const twoHours = 2 * 60 * 60;
const sixHours = 6 * 60 * 60;
const tenHours = 10 * 60 * 60;
const oneDay = 24 * 60 * 60;
const oneWeek = 7 * 24 * 60 * 60;

ZsCache.Cache = Cache;
ZsCache.LocalCache = LocalCache;

ZsCache.KEYS = {
    USER_DETAIL_PREFIX: 'user:',
    ENTITY_DETAIL_PREFIX: 'entity:',
    ACTIVITY_EVENT_MAP_PREFIX: 'activity_event_map:',
    ACCESS_TOKEN_KEY: (role, token) => {
        return `token:${role}:${token}`;
    }
};

ZsCache.getUserDetailsFromIdAndRole = (id, role) => {
    const key = `${ZsCache.KEYS.USER_DETAIL_PREFIX}${role}:${id}`;
    // partner objects are kept in local cache. p stands for partner.
    // change this if any new role comes in the system starting with 'p'.
    if (role[0] === 'p') {
        return LocalCache.get(key);
    }
    return Cache.get(key);
};

ZsCache.setUserDetailsFromIdAndRole = (id, role, value) => {
    /*
    TODO: keys from value can be removed here to save redis space
     */
    role = role.toLowerCase();
    const key = `${ZsCache.KEYS.USER_DETAIL_PREFIX}${role}:${id}`;
    if (!value) {
        // partner objects are kept in local cache. p stands for partner.
        // change this if any new role comes in the system starting with 'p'.
        if (role[0] === 'p') {
            return LocalCache.del(key);
        }
        return Cache.del(key);
    }
    if (role[0] === 'p') {
        return LocalCache.set(key, value);
    }

    return Cache.set_with_ttl(key, value, oneDay);
};

ZsCache.getUserIdFromTokenAndRole = (token, role) => {
    const key = ZsCache.KEYS.ACCESS_TOKEN_KEY(role, token);
    return Cache.get(key);
};

ZsCache.setTokenForIdAndRole = ({ id, role, token, ttl }) => {
    const key = ZsCache.KEYS.ACCESS_TOKEN_KEY(role, token);
    if (!id) {
        return Cache.del(key);
    } else {
        if (ttl) {
            return Cache.set_with_ttl(key, id, ttl);
        } else {
            return Cache.set(key, id);
        }
    }
};


ZsCache.setEntityWithIdAndType = (id, type, value, isLocal) => {
    type = type.toLowerCase();
    const key = `${ZsCache.KEYS.ENTITY_DETAIL_PREFIX}${type}:${id}`;
    if (!value) {
        if (!!isLocal) {
            return LocalCache.del(key);
        }
        return Cache.del(key);
    }
    if (!!isLocal) {
        return LocalCache.set(key, value);
    }

    return Cache.set_with_ttl(key, value, oneDay);
};

ZsCache.getEntityFromIdAndType = (id, type, isLocal) => {
    type = type.toLowerCase();
    const key = `${ZsCache.KEYS.ENTITY_DETAIL_PREFIX}${type}:${id}`;
    if (isLocal) {
        return LocalCache.get(key);
    }
    return Cache.get(key);
};
