'use strict';

var express = require('express')
var bodyParser = require('body-parser')

var path = require('path')
var fs = require('fs')
var utilx = require('utilx')
var childProcess = require('child_process')

var logger = require('./logger')
var manager = require('./manager')

//var inherits = require('util').inherits
//var Proxy = require('./proxy')

module.exports = Server


var defaultCfg = {
  host: utilx.getExternalIpAddress() || 'localhost',
  port: 9999
}


function Server(cfg) {
  if (cfg.debug) {
    logger.setLevel('debug')
  }

  var projectCfg = utilx.readJSON('totoro-server-config.json')
  this.cfg = utilx.mix(cfg, projectCfg, defaultCfg)
  this.launchServer()
}

Server.prototype.launchServer = function () {
  var cfg = this.cfg
  var app = this.app = express()
  var server = require('http').Server(app)
  var io = this.io = require('socket.io')(server, {
    log: false
  })
  var that = this


  //---------------------------------------------------------------
  // Static resources
  //---------------------------------------------------------------
  var staticPath = path.join(__dirname, '..', 'driver')
  app.use('/__static', express.static(staticPath))
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({extended: false}))

  app.use('/target-demo', express.static(
    path.join(__dirname, '../target-demo')
  ))

  app.get('/', function (req, res) {
    res.sendFile(path.join(staticPath, 'driver.html'))
  })


  // receive data
  app.post('/__report', function (req, res) {
    logger.debug('Received report data.', req.body)
    var data = req.body
    if ('__totoro_data' in data) {
      manager.report(JSON.parse(req.body.__totoro_data))
    } else {
      manager.report(req.body)
    }
    res.send('totoro server received data.')
  })


  //---------------------------------------------------------------
  // about labor manager
  //---------------------------------------------------------------

  // when ui connect
  io.of('/__manager').on('connection', function (socket) {
    socket.emit('init', manager.list())
  })

  // when labor connect
  io.of('/__labor').on('connection', function (socket) {
    socket.on('init', function (data) {
      if (!Array.isArray(data)) data = [data]
      data.forEach(function (d) {
        var labor = manager.addLabor(socket, d)
        io.of('/__manager').emit('add', manager.info(labor))

        labor.on('destroy', function () {
          io.of('/__manager').emit('remove', labor.id)
        })
      })
    })
  })


  //---------------------------------------------------------------
  // about client run task
  //---------------------------------------------------------------
  var serverVersion = require('../package.json').version
  var serverMainVersion = mainVersion(serverVersion)


  // client connect
  io.of('/__order').on('connection', function (socket) {
    // client push data
    socket.on('init', function (data) {
      var clientVersion = data.version

      if (serverMainVersion !== mainVersion(clientVersion)) {
        socket.emit('report', [{
          action: 'error',
          info: ['Client version mismatch! ' +
          'Please install version ' +
          serverMainVersion + '.*']
        }])
        return
      }

      manager.addOrder(socket, data)
    })
  })


  //---------------------------------------------------------------
  // about execute task
  //---------------------------------------------------------------

  var callTotoroClient = function (options, callback) {
    var runTotoroFile = path.join(__dirname, 'run-totoro.js')
    var cmd = that.cfg.node + ' ' + runTotoroFile + ' ' + options.runner + ' ' + that.cfg.host
    childProcess.exec(cmd, function (err, stdout, stderr) {
      if (err) {
        console.error(err)
      }
      var report = fs.readFileSync(path.join(__dirname, '../cache.json'))
      callback(report)
    })
  }


  //totoro.prototype.destroy = function() { }
  app.get('/runTask', function (req, res) {
    var runner = req.query.runner
    console.log('begin to run task: ' + runner)

    callTotoroClient({
      runner: runner
    }, function (result) {
      res.send(result)
    })
  })


  app.get('/runCase', function (req, res) {
    var casedata = {
      "setup": "",
      "casedesc": "武汉市_420100_车辆年审查询",
      "type": "mmtest",
      "domain": "jiaojing.qq.com",
      "cginame": "citylife/inspect",
      "method": "GET",
      "request": {},
      "response": {},
      "teardown": "",
    }

    var url = 'http://' + casedata.domain + '/' + casedata.cginame
    console.log('execute casedata: %s', url)
    callTotoroClient({
      runner: url
    }, function (result) {
      res.setHeader('content-type', 'application/json')
      res.send(result)
    })
  })


  //---------------------------------------------------------------
  // START
  //---------------------------------------------------------------

  server.listen(cfg.port, cfg.host, function (socket) {
    logger.info('Start server <', cfg.host + ':' + cfg.port, '>')
  })
}


function mainVersion(v) {
  return v.substring(0, v.lastIndexOf('.'))
}


/*
 io.set('transports', [
 'websocket',
 'jsonp-polling',
 'xhr-polling',
 'flashsocket',
 'htmlfile'
 ])
 */


//// proxy
//app.get('*', function (req, res) {
//  if (/\.ico$/.test(req.url)) {
//    res.send('')
//  } else {
//    Proxy.proxy(req, res)
//  }
//})


//new totoro({
//  host: cfg.host,
//  coverage: true,
//  port: '9999',
//  timeout: '1',
//  runner: runner,
//  report: function(info) {
//    res.send(info)
//  }
//})