const fs = require('fs');

const logger = require('./logging').Logger;
const AWS = require('./aws');

const snapshotPath = '.website.backup.tar.snapshot.bin';

function run(backup_type, cfg, timeStamp, tmp_dir, callback) {

    createBkpCmd(cfg);

    function createBkpCmd (cfg) {
        const bkpFile = `app.${backup_type}.${timeStamp}.tgz`;
        const bkpFileFullPath = `${tmp_dir}${bkpFile}`;

        var bkpLvl = (backup_type === 'incremental' ? '' : '--level=0');
        var bkpCmd = `tar --create -C / '${cfg.file_location.replace('/','')}' --listed-incremental=${snapshotPath} --gzip \
        --no-check-device \
        ${bkpLvl} \
        --file=${bkpFileFullPath} ${cfg.file_location}`;
        logger.info('app',`Running app backup...`, true);
        runBkpCmd(bkpCmd, bkpFileFullPath);
    }

    function runBkpCmd (bkpCmd, bkpFileFullPath) {
        const exec = require('child_process').exec;
        exec(bkpCmd, (err, stdout, stderr) => {
            if (err) {
                fs.unlink(bkpFileFullPath, (delErr) => {
                    if(delErr) err += delErr; 
                    return callback(err);
                });
            } else if (stderr) {
                fs.unlink(bkpFileFullPath, (delErr) => {
                    if(delErr) stderr += delErr;
                    return callback(stderr);
                });
            } else {
                logger.info(`app`,'Completed. Transferring to AWS bucket ...',true);
                AWS.uploadFile(bkpFileFullPath, null, backup_type, 'app', (err, data) => {
                    if (err) return callback(err);
                    else {
                        logger.info('app', data, true);
                        return callback(undefined, bkpFileFullPath);
                    }
                });
            }
        })
    }
}

module.exports = {
    run
}