const fs = require('fs');
const path = require('path');

const schedule = (cronFile) => {
    var exec = require('child_process').exec;
    var listCrontab = `crontab -l | grep ${require.main.filename} | wc -l`;
    //console.log(module.parent.filename);
    exec(listCrontab, (error, stdout, stderr) => {
        if (error) {
            console.log(error);
        } else if (stderr && (stderr.search('no crontab for') < 0)) {
            console.log(stderr);
        } else if (stdout) {
            if (parseInt(stdout) === 0) // Then no jobs have been scheduled, proceed with scheduling
            {
                // Get filename
                execFileName = '/usr/local/bin/' + path.basename(require.main.filename).replace(/\.[^/.]+$/, "");
                fs.readFile(cronFile, (err, data) => {
                    if (err) throw err;
                    var array = data.toString().split("\n");
                    array = array.filter((value) => !RegExp(/^#/).test(value));
                    for (i in array) {
                        var execSync = require('child_process').execSync;
                        array[i] = array[i].replace(/BACKUPEXEC/g, execFileName);
                        try {
                            execSync(`(crontab -l 2>/dev/null; echo "${array[i]}")| crontab -`);
                        } catch (e) {
                            console.log(e);
                            break;
                        }
                    }
                });
            } else {
                console.log(`It looks like jobs under ${require.main.filename} have already been scheduled. Please edit them or delete them to load the regular crontab schedule.`)
            }
        }
    })
};

module.exports = {
    schedule
}