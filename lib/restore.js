const AWS = require('./aws');
const moment = require('moment');
const logger = require('./logging').Logger;

const siteRestore = require('./site-restore');
const dbRestore = require('./db-restore');

// argv.up_to, argv.restore_files, argv.database, argv.db_only, argv_files_only
function runRestore(up_to, restore_files, database, db_only, files_only, callback) {
    if (files_only === true)
    {
        logger.debug('runRestore.files_only');
        siteRestore.run(up_to, restore_files, (err, resp) => {
            if (err) return callback(err);
            else return callback(undefined, resp);
        })
    }
    else if (db_only === true)
    {
        logger.debug('runRestore.db_only');
        dbRestore.run(up_to, restore_files, database, (err, resp) => {
            if (err) return callback(err);
            else return callback(undefined, resp);
        })
    }
    else if (db_only !== true && files_only !== false)
    {
        logger.debug('runRestore.both');
        siteRestore.run(up_to, restore_files, (err, resp) => {
            if (err) return callback(err);
            else return callback(undefined, resp);
        })
        dbRestore.run(up_to, restore_files, database, (err, resp) => {
            if (err) return callback(err);
            else return callback(undefined, resp);
        })
    }
}


module.exports = {
    runRestore
}