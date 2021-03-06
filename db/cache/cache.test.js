'use strict';

global.Config = require('../../../tests/config');

let Cache = require('./index');

describe('Cache class works as expected', function() {
    let testKey = 'testing_key';
    let valueToSet = Math.random();

    beforeAll(function() {
        Cache.getInstance();
    });

    test('we can set values in redis', function() {
        expect.assertions(1);
        return Cache.set(testKey, valueToSet)
            .then(function(result) {
                expect(result).not.toBe(null);
            });
    });

});