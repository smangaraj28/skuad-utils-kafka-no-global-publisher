'use strict';

const Zenziva = require('./Zenziva');

const config = global.Config.zenziva || {};

module.exports = {
    Zenziva: new Zenziva(config)
};
