const yaml = require('js-yaml');
const fs = require('fs');

// NOTE: This is already a GOLD version. No modifications required.

const getParams = (cfgFile, callback) => {
    try {
        if (!cfgFile) cfgFile = '/etc/bares/backup_conf.yml';
        var doc = yaml.safeLoad(fs.readFileSync(cfgFile, 'utf8'));
        return callback(undefined, doc);
    } catch (e) {
        return callback(`The config file '${cfgFile}' cannot be read.\n${e}`);
    }
}

function getParamsV2(cfgFile) {
    try {
        if (!cfgFile) cfgFile = '/etc/bares/backup_conf.yml';
        var doc = yaml.safeLoad(fs.readFileSync(cfgFile, 'utf8'));
        return doc;
    } catch (e) {
        return `The config file '${cfgFile}' cannot be read.\n${e}`;
    }
}

module.exports = {
    getParams,
    getParamsV2
};