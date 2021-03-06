'use strict';
const {CoreService} = require('../apiWrappers/core');

const Helpers = require('../util/helpers');
const {Elastic} = require('../db');
const elastic = new Elastic(global.Config.elasticsearch && global.Config.elasticsearch.connections.reporting);

const Logger = require('../logger').getInstance({
    module: 'models'
});

class BaseModel {
    constructor(props) {
        this.id = props.id;
        this.role = props.role;
        this.logger = props.logger || Logger;
    }

    findById() {
      return CoreService.get(`${this.resource}/${this.id}`, null, {
        baseUrl: this.service,
        logger: this.logger
      })
    }

    find(filter, page, size, sort) {
        return CoreService.get(this.resource, {
            filter,
            page,
            size,
            sort
        }, {logger: this.logger});
    }

    search(criteria) {
        if(!this.index) {
            throw new Error('Index is required');
        }
        return elastic.search(this.index, this.type || '_doc', criteria)
            .then(results => {
                let hits = results && results.hits && results.hits.hits;
                if(results && results.hits && results.hits.total < 10000) {
                    return hits && hits.length > 0 ? hits.map(hit => hit._source) : [];
                }

                return elastic.scroll(this.index, this.type || '_doc', criteria)
            })
    }

    filter(criteria, limit, page) {
        if(!this.index) {
            throw new Error('Index is required');
        }
        return elastic.search(this.index, this.type || '_doc', criteria)
            .then(results => {
                results.limit = (limit)?parseInt(limit):20;
                results.page = (page)?parseInt(page)-1:0;
                return Helpers.elasticResponseParser(results,d => d._source)
            })
    }

}

module.exports = BaseModel;
