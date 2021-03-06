'use strict';

module.exports = class QueryMaker {
    constructor() {
        this.mustQuery = [];
        this.shouldQuery = [];
        this.sortQuery = [];
        this.filterQuery = [];
        this.mustNotQuery = [];
        this.aggregationQuery = {};
    }

    matchMust(valkey, value) {
        if (value)
            this.mustQuery.push({"match": { [valkey] : value }});
        return this;
    }

    matchPhraseMust(valkey, value) {
        if (value) {
            this.mustQuery.push({"match_phrase": {[valkey]: value }});
        }
        return this;
    }

    termsMust(valkey, values) {
        this.mustQuery.push({"terms": {[valkey]: values}});
        return this;
    }

    termsFilter(valkey, values) {
        this.filterQuery.push({"terms": {[valkey]: values}});
        return this;
    }

    shouldMust(shouldQueryVar) {
        this.mustQuery.push({
            "bool": {
                "should": shouldQueryVar || this.shouldQuery
            }
        });
        return this;
    }

    matchShould(valkey, value) {
        if (value)
            this.shouldQuery.push({"match": { [valkey]: value }});
        return this;
    }

    wildcardShould(valkey, value) {
        if (value)
            this.shouldQuery.push({"wildcard": { [valkey]: value }});
        return this;
    }

    matchPhraseShould(valkey, value) {
        if (value)
            this.shouldQuery.push({"match_phrase": { [valkey]: value }});
        return this;
    }

    mustShould(mustQueryVar) {
        this.shouldQuery.concat({
            "bool": {
                "must": mustQueryVar || this.mustQuery
            }
        });
        return this;
    }

    rangeSearch(startDate, endDate, field) {
        if (!startDate) {
            startDate = new Date(0);;
        }

        if (!endDate) {
            endDate = new Date();
        }

        this.mustQuery.push({
            "range": {
                [field || 'created']: {
                    "gte": startDate,
                    "lte": endDate
                }
            }
        });
        return this;
    }

    sortValue(val, order) {
        this.sortQuery.push({
                [val]: {
                    "order": order
                }
        });
        return this;
    }

    addTermAggs(aggregationName, field, sortField = '_count', sortOrder = 'desc') {
        if (!this.aggregationQuery[aggregationName] && aggregationName && field) {
            this.aggregationQuery[aggregationName] = {
                "terms": {
                    "field": field,
                    "order": {[sortField]: sortOrder}
                }
            }
        }
        return this;
    }

    criteria(page, limit) {

        if (!page)
            page = 0;
        else
            page -= 1;

        if (!limit)
            limit = 20;

        // let deletionCheck = this.deletionCheck();
        // this.shouldMust(deletionCheck);
        this.mustNotQuery.push({"exists": {
                "field": "deleted"
            }});

        let criteria = {
            "query": {
                "bool": {
                    "must":  this.mustQuery,
                    "should": this.shouldQuery,
                    "filter": this.filterQuery,
                    "must_not": this.mustNotQuery
                }
            },
            "aggs": this.aggregationQuery,
            "sort": this.sortQuery,
            from : page * limit,
            size : limit
        };

        return criteria;
    }
};
