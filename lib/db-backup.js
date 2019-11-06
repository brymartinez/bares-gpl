const fs = require('fs');

const logger = require('./logging').Logger;
const AWS = require('./aws');
const incremental = require('./incremental');

// var cliOptions = (cfg.mysql.user ? ' -u ' + cfg.mysql.user : ' ') + (cfg.mysql.password ? ' -p' + cfg.mysql.password : ' ') + ' -h ' + cfg.mysql.host;
function run(backup_type, cfg, timeStamp, tmp_dir, database, callback) {
    // Case switching for database backup
    if (backup_type !== 'incremental')
    {
        prepareDatabases(cfg, database, (err,response) => {
            if (err) return callback(err);
            else if (response)
            {
                response.forEach((db) => {
                    createBkpCmd(cfg, db);
                })
            }
        })
    }
    else {
        logger.info('db','Flushing logs...',true);
        executeSQL('flush logs;', cfg, (err,data) => { // Flushing logs for all databases
            if (err) {
                logger.debug(`DbBackup.flushlogs ${err}`);
                return callback(err);
            } else {
                logger.info('db','Running incremental backup...',true);
                incremental.run(cfg, timeStamp, tmp_dir, (err, data) => {
                    if (err) return callback(err);
                    else {
                        return callback(undefined, tmp_dir);
                    }
                })
            }
        });
    }

    function createBkpCmd (cfg, database) {
        const bkpFile = `db.${database}.${backup_type}.${timeStamp}.sql.gz`;
        const bkpFileFullPath = `${tmp_dir}${bkpFile}`;
        var cliOptions = (cfg.mysql.user ? ' -u ' + cfg.mysql.user : ' ') + (cfg.mysql.password ? ' -p' + cfg.mysql.password : ' ') + ' -h ' + cfg.mysql.host + ' ' + database;

        var bkpCmd = `${cfg.mysql.bin_path}mysqldump --quick --single-transaction --create-options `;
        if (cfg.mysql.bin_log) bkpCmd += ' --flush-logs --master-data=2 --delete-master-logs ';
        bkpCmd += `${cliOptions} | gzip > ${bkpFileFullPath}`
        logger.info(`db_${database}`,`Running backup for database '${database}'...`, true);
        runBkpCmd(bkpCmd, database, bkpFileFullPath);
    }

    function runBkpCmd (bkpCmd, database, bkpFileFullPath) {
        const exec = require('child_process').exec;
        exec(bkpCmd, (err, stdout, stderr) => {
            if (err) {
                fs.unlink(bkpFileFullPath, (delErr) => {
                    if(delErr) err += delErr;
                    return callback(err);
                });
            } else if (stderr && stderr.indexOf("[Warning]") <= -1) {
                fs.unlink(bkpFileFullPath, (delErr) => {
                    if(delErr) stderr += delErr;
                    return callback(stderr);
                });
            } else {
                logger.info(`db_${database}`,'Completed. Transferring to AWS bucket ...',true);
                AWS.uploadFile(bkpFileFullPath, null, backup_type, { "db": database }, (err, data) => {
                    if (err) return callback(err);
                    else {
                        logger.info(`db_${database}`,data, true);
                        return callback(undefined, bkpFileFullPath);
                    }
                });
            }
        })
    }

}

function executeSQL(sql, cfg, response) {
    var cliOptions = (cfg.mysql.user ? ' -u ' + cfg.mysql.user : ' ') + (cfg.mysql.password ? ' -p' + cfg.mysql.password : ' ') + ' -h ' + cfg.mysql.host;
    
    const cmd = `${cfg.mysql.bin_path}mysql --silent --skip-column-names -e \"${sql}\" ${cliOptions}`;
    
    const exec = require('child_process').exec;
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            return response(err); 
        }
        else if (stderr) {
            return response(stderr);
        }
        else {
            return response(undefined,stdout.split("\n").filter((dbName) => dbName !== ''));
        }
    });
}

function prepareDatabases(cfg, database, response) {
    const sysDatabases = ['sys','information_schema','mysql','performance_schema'];
    const likeClause = (database === "all" ? "" : ` like '${database}'`);
    executeSQL(`show databases${likeClause};`, cfg, (err, data) => {
        if (err) {
            return response(err);
        }
        else if (Object.keys(data).length === 0) {
            return response('Database not found.');
        }
        else {
            data = data.filter((dbName) => { return sysDatabases.indexOf(dbName) < 0 });
            if (Object.keys(data).length === 0) return callback('Can only back up user databases!');
            else response(undefined,data);
        }
    })
}

module.exports = {
    run,
    executeSQL,
    prepareDatabases
}