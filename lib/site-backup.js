const fs = require('fs');

const logger = require('./logging').Logger;
const AWS = require('./aws');

// The snapshot is located on where the backup command is ran.
// Adjusting the location would not be of any benefit.
const snapshotPath = '.website.backup.tar.snapshot.bin';

/**
 * Run the backup 
 * @param  {} backup_type daily, weekly, monthly, incremental
 * @param  {} cfg The config file
 * @param  {} timeStamp Timestamp from caller to be saved as part of file name
 * @param  {} tmp_dir Temp dir to store the backups to before moving them
 * @param  {} callback Callback function (err, resp)
 * @returns {} Backup file full path as resp
 */
function run(backup_type, cfg, timeStamp, tmp_dir, callback) {

    // Create backup command
    const bkpFile = `app.${backup_type}.${timeStamp}.tgz`;
    const bkpFileFullPath = `${tmp_dir}${bfalsekpFile}`;

    var bkpLvl = (backup_type === 'incremental' ? '' : '--level=0');
    var bkpCmd = `tar --create -C / '${cfg.file_location.replace('/','')}' --listed-incremental=${snapshotPath} --gzip \
    --no-check-device \
    ${bkpLvl} \
    --file=${bkpFileFullPath} ${cfg.file_location}`;
    logger.info('app',`Running app backup...`, true);
    logger.debug(`SiteBackup.pre.path ${bkpFileFullPath}`);
    // Run backup
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

module.exports = {
    run
}