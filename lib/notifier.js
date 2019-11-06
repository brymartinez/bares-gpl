// curl -X POST --data-urlencode "payload={\"channel\": \"#backup_system\", \"username\": \"webhookbot\", \"text\": \"This is posted to #general and comes from a bot named webhookbot.\", \"icon_emoji\": \":ghost:\"}" https://hooks.slack.com/services/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

const request = require('request-promise');
const config = require('./config');
const argv = require('yargs').argv;
const logger = require('./logging').Logger;

const cfg = config.getParamsV2(argv.c);
if (typeof cfg === 'string') return cfg;

async function notifyOnSlack(backup_type, hasFailed) {
    try {
        
        if (hasFailed)
        {
            logger.debug('Notifier.failure');
            var userList = cfg.slack.mention_users_on_failure;
            var userListStr = '';
            for (let key in userList) {
                userListStr += '<@' + userList[key] + '> ';
            }
            var payload = {
                mkdwn: true,
                text: `*BACKUP FAILURE: ${backup_type} for ${cfg.s3.prefix}*. See ${cfg.logging.logfile_path} for more details. ${userListStr}`,
                icon_emoji: ':bomb:'
            }
        }
        else if (!hasFailed && cfg.slack.notify_on_success)
        {
            logger.debug('Notifier.success');
            var userList = cfg.slack.mention_users_on_success;
            var userListStr = '';
            for (let key in userList) {
                userListStr += '<@' + userList[key] + '> ';
            }
            var payload = {
                mkdwn: true,
                text: `*BACKUP SUCCESS: ${backup_type} for ${cfg.s3.prefix}*. ${userListStr}`,
                icon_emoji: ':100:'
            }
        }
        else {
            logger.debug('Notifier.caseless');
            return;
        }
        url = cfg.slack.webhook;

        logger.debug(`Notifier.request.url ${url}`);
        logger.debug(`Notifier.request.userList ${userListStr}`);
        const res = await request({
            url: url,
            method: 'POST',
            body: payload,
            json: true
        })
        logger.debug('Notifier.request.post');
    } catch (e) {
        logger.error('notify',e,true);
    }
}
module.exports = {
    notifyOnSlack
}