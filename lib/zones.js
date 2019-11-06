var moment = require('moment-timezone');
var timeZones = moment.tz.names();
let offsetTmz = [];

for (let i in timeZones) {
    offsetTmz.push(`(GMT${moment.tz(timeZones[i]).format('Z')}) ${timeZones[i]}`);
}

var timeZoneNames = offsetTmz.sort();

const search = (tzregex) => {
    if (tzregex) {
        console.log(`Search results for keyword: ${tzregex}`)
        console.log('---');
        var tznames = timeZoneNames.filter((value) => RegExp(tzregex, "g").test(value));
        return tznames;
    } else return JSON.stringify(timeZoneNames, undefined, 2);
}

module.exports = {
    search
}