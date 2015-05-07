var totoro = require('totoro')
var fs = require('fs')
var path = require('path')

new totoro({
  host: process.argv[3],
  coverage: true,
  port: '9999',
  timeout: '1',
  runner: process.argv[2],
  report: function (info) {
    fs.writeFileSync(path.join(__dirname, '../cache.json'), JSON.stringify(info))
  }
})