'use strict';

const fs = require('fs');
const Swig = require('swig');
const path = require('path');

fs.readdirSync(__dirname).forEach(file => {
    // If its the current file ignore it
    if (file === 'index.js' || !file.endsWith('.html')) return;

    // Store module with its name (from filename)
    module.exports[file] = Swig.compileFile(path.resolve(__dirname, file));
});
