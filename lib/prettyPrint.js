var prettyPrint = function(record) {
    var prettyObj = '';
    for (var key in record[0]) {
        if (record[0].hasOwnProperty(key)) {
            console.log("*" + key + "*: " + record[0][key]);
            prettyObj += "\n*" + key + "*: " + record[0][key];
        }
    }
    debugger
    return prettyObj;
}

module.exports = prettyPrint;