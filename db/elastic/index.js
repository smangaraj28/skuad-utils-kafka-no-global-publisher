'use strict';

const ES = require('elasticsearch');
const Q = require('q');
let logger = require('../../logger').getInstance({'worker': 'db-elastic'});

class Elastic {
    constructor(host, httpAuth) {
        let config = {
            host
        };
        if(httpAuth) {
            config['httpAuth'] = httpAuth;
        }
        this.client = new ES.Client(config);
    }

    insert(index, type, body, id) {
        let deferred = Q.defer();

        this.client.index({
            index,
            type,
            id: id || undefined,
            body,
        }, (error, data) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    }

    search(index, type, criteria) {
        let deferred = Q.defer();

        this.client.search({
            index,
            type,
            body: criteria,
        }, (error, data) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(data);
            }
        });

        return deferred.promise;
    }

    scroll(index,type,criteria,scroll ='10s'){
        let deferred = Q.defer();
        let allRecords = [];
        let thisClient = this.client;

        thisClient.search({
            index,
            type,
            scroll,
            body:criteria,
        },function getMoreUntilDone(error,data) {
            if (error) {
                deferred.reject(error);
            }
            else {
                data.hits.hits.forEach(function (hit) {
                    allRecords.push(hit._source);
                });

                if (data.hits.total !== allRecords.length) {
                    // now we can call scroll over and over
                    thisClient.scroll({
                        scrollId: data._scroll_id,
                        scroll: '10s'
                    }, getMoreUntilDone);
                } else {
                    deferred.resolve(allRecords);
                }
            }
        });
        return deferred.promise;
    }

    update(index, type, document, id) {
        let deferred = Q.defer();

        this.client.update({
            index,
            type,
            id: id,
            body: {
                doc: document,
            },
            retryOnConflict: 20,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    delete(index, type, id) {
        let deferred = Q.defer();

        this.client.delete({
            type,
            index,
            id,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    exists(index, type, id) {
        let deferred = Q.defer();

        this.client.exists({
            index,
            type,
            id,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    existsIndex(index) {
        let deferred = Q.defer();
        this.client.indices.exists({
            index
        }, (error, result) => {
            if(error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });
        return deferred.promise;
    }

    createIndex(index, body) {
        let deferred = Q.defer();

        this.client.indices.create({
            index,
            body,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    deleteIndex(index) {
        let deferred = Q.defer();

        this.client.indices.delete({
            index,
        }, (error, result) => {
            if (error) {
                if (error.displayName === 'NotFound') {
                    deferred.resolve({
                        acknowledged: true,
                    });
                } else {
                    deferred.reject(error);
                }
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    bulkInsert(index, type, documents) {
        let deferred = Q.defer();
        let body = [];

        documents.forEach(doc => {
            body.push({
                index: {
                    _index: index,
                    _type: type,
                    _id: doc.id || undefined,
                },
            });
            body.push(doc);
        });

        this.client.bulk({
            body,
            index,
            type,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    bulkDelete(index, type, docs) {
        let body = docs.map(function(doc) {
            return {delete: {_index: index, _type: type, _id: doc.id}};
        });
        logger.info(`[elastic][bulkDelete] Calling bulk delete for ${body.length} records`);
        return this.client.bulk({index: index, type: type, body: body});
    }

    bulkUpsert(index, type, docs) {
        let promises = [];
        var i,j,body,chunk = 1000;
        logger.info(`[elastic][bulkUpsert] Bulk Upserting - ${index}/${type}`);
        for (i=0,j=docs.length; i<j; i+=chunk) {
            body = [];
            docs.slice(i,i+chunk).forEach(doc => {
                body.push({index: {_index: index, _type: type, _id: doc.id}});
                body.push(doc);
            });
            promises.push(this.client.bulk({index: index, type: type, body: body}));
        }
        logger.info(`[elastic][bulkUpsert] End Bulk Upserting - ${index}/${type}`);
        return Promise.all(promises);
    }

    reindex(sourceIndex, destIndex) {
        let body = {
            "source": {
                "index": sourceIndex
            },
            "dest": {
                "index": destIndex
            }
        };

        return this.client.reindex({
            body,
        });
    }

    putMapping(index, type, mapping) {
        let deferred = Q.defer();

        this.client.indices.putMapping({
            index,
            type,
            body: mapping,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    getMapping(index) {
        let deferred = Q.defer();

        this.client.indices.getMapping({
            index,
        }, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    match(clauses, type, index) {
        let deferred = Q.defer();

        let queryObj = {query: {bool: {}}};
        if (!index) {
            index = 'indifi';
        }
        if (clauses['query']) {
            queryObj['query'] = clauses['query'];
        }
        if (clauses['filter']) {
            queryObj['query']['bool']['filter'] = clauses['filter'];
        }
        if (clauses['must']) {
            queryObj['query']['bool']['must'] = clauses['must'];
            queryObj['min_score'] = 0.9;
        }
        if (clauses['should']) {
            queryObj['query']['bool']['should'] = clauses['should'];
        }
        if (clauses['sort']) {
            queryObj['sort'] = clauses['sort'];
        }
        queryObj['from'] = 0;
        queryObj['size'] = 10000;

        let request = {index: index, body: queryObj};
        if (type) {
            request.type = type;
        }

        this.client.search(request, (error, result) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(result);
            }
        });

        return deferred.promise;
    }

    putAlias(alias, index) {
        return this.client.indices.putAlias({
            index: index,
            name: alias
        });
    }

    getAlias(alias) {
        return this.client.indices.getAlias({
            name: alias
        })
    }

    updateAlias(alias, newIndex) {
        let deferred = Q.defer();
        let oldIndex;

        this.client.indices.getAlias({
            name: alias,
        }).then(aliasDetails => {
            oldIndex = Object.keys(aliasDetails)[0];
            this.client.indices.updateAliases({
                body: {
                    actions: [
                        {remove: {index: oldIndex, alias: alias}},
                        {add: {index: newIndex, alias: alias}},
                    ],
                },
            }, (error, data) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve({oldIndex: oldIndex, newIndex: newIndex});
                }
            });
        }).catch(function(error) {
            deferred.reject(error);
        });

        return deferred.promise;
    }

    backupLogsByDate(customDate, repository) {
        const indexName = `logstash-${customDate.format('YYYY.MM.DD')}`;
        let deferred = Q.defer();
        this.client.snapshot.create({
            repository,
            snapshot: indexName,
            wait_for_completion: true,
            body: {
                indices: indexName
            }
        }, (error, data) => {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(data);
            }
        });
        return deferred.promise;
    }

    close() {
        return this.client.close();
    }
}

module.exports = Elastic;
