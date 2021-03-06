'use strict';

var when = require('when')
var path = require('path')
var url = require('url')
var iconv = require('iconv-lite')
var jscoverage = require('jscoverage')
var querystring = require('querystring')
var logger = require('./logger')

var adapt = require('./adapt')
var manager = require('./manager')


module.exports = Proxy


// private
function Proxy(id) {
  var that = this
  var order = this.order = manager.orders[id]
  var runner = order.parsedRunner.path
  var protocol = order.parsedRunner.protocol

  this.protocol = protocol.slice(0, protocol.indexOf(':'))
  this.socket = order.socket
  this.cache = {}

  this.order.on('destroy', function() {
    delete Proxy.caches[id]
    logger.debug('Proxy destroys', {orderId: id})
  })

  this.useSocket = when.defer()
  this.getRequestType(runner, function(useSocket) {
    logger.debug('Get proxy type', {
      orderId: id,
      useSocket: useSocket
    })
    if (useSocket) {
      that.socket.on('proxyRes', function(info) {
        /*
         * NOTE
         * the buffer through the socket transmission,
         * is transformed into a character array
         */
        info.body = new Buffer(info.body)
        that.requestCb(info.path, info)
      })
    }

    that.useSocket.resolve(useSocket)
  })

  logger.debug('New proxy', {orderId: id})
}

// the only public method
Proxy.proxy = function(req, res) {
  var p = req.url
  var ref = req.headers.referer
  var id, laborId

  // find order id
  var parsedP = url.parse(p, true)
  var query = parsedP.query;
  if (query && query.__totoro_oid ) {
    id = query.__totoro_oid
    laborId = query.__totoro_lid
  } else if (ref) { // ref may be undefined
    var parsedRef = url.parse(ref, true)
    id = parsedRef.query.__totoro_oid
    laborId = parsedRef.query.__totoro_lid
  }

  var logInfo = { orderId: id, path: p, ref: ref }

  res.header(
    'Cache-Control',
    'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
  )

  if (!id) {
    logger.warn('Request with no order id.', logInfo)
    res.status(404).end()

  } else if (!(id in manager.orders)) {
    logger.warn('Request with no invalid order id', logInfo)
    res.status(404).end()

  // NOTE
  // an iframe or window opened by runner
  } else if ((!query || !query.__totoro_oid) && (/\.html$/.test(parsedP.pathname) || /text\/html/.test(req.headers.accept))) {
    logger.debug('Redirect iframe/window', logInfo)

    var hasQuery = p.indexOf('?') !== -1
    var redirectP = p.replace(
      /(#.*$)|$/,
      (hasQuery ? '&' : '?') + '__totoro_oid=' + id +
      '&' + '__totoro_lid=' + laborId +
      '$1')

    res.redirect(redirectP)

  } else {
    //logger.debug('Proxy request', logInfo)
    query && delete query['__totoro_oid']
    query && delete query['__totoro_lid']
    var qs = querystring.stringify(query)
    p = parsedP.pathname
    if (qs) {
      p += '?' + qs
    }

    var proxy = Proxy.getProxy(id)
    proxy.getData(p, req, res)
  }
}

Proxy.getProxy = function(id) {
  var caches = Proxy.caches
  return caches[id] || (caches[id] = new Proxy(id))
}

Proxy.caches = {/*
   orderId: proxyInstance
*/}


Proxy.prototype.getRequestType = function(p, cb){
  var opts = this.getOpts(p, 'head')

  if (opts.hostname === 'localhost' || opts.hostname === '127.0.0.1') {
    cb(true)
    return
  }

  require(this.protocol).request(opts, function(res) {
    // NOTE don't delete this empty listener, or request() will not work
    res.on('data', function(data) {})

    res.on('end', function() {
      var statusCode = res.statusCode
      var useSocket = statusCode < 200 || 399 < statusCode ? true : false
      cb(useSocket)
    })
  }).on('error', function(err) {
    cb(true)
  }).end()
}

Proxy.prototype.getData = function(p, req, res) {
  var that = this
  var cache = this.cache

  if (!cache[p]) {
    cache[p] = when.defer()

    this.useSocket.promise.then(function(useSocket) {
      that.request(p, req, useSocket)
    })
  }

  cache[p].promise.then(function(info) {
    if (!Buffer.isBuffer(info.body)) {
      info.body = new Buffer(info.body)
    }

    info.headers['content-length'] = info.body.length
    res.writeHead(info.statusCode, info.headers)
    res.end(info.body)
  })
}

Proxy.prototype.request = function(p, req, useSocket) {
  /*
   * NOTE
   * delete host to avoid request original url
   * delete accept-encoding to avoid server gzip
   */
  delete req.headers['host']
  ;delete req.headers['accept-encoding']

  /*
   * NOTE
   * every browser sends request to server respectively
   * for the sake of efficiency server only proxy the same request once
   * if the first reached request from browser has a cache
   * a 304 response with no body will be returned
   * and if some other browser has no cache, the 304 response will cause an error
   */
  req.headers['Cache-Control'] = 'no-cache'

  if (useSocket) {
    this.socket.emit('proxyReq', {
      path: p,
      headers: req.headers
    })
  } else {
    this.defaultRequest(p, req)
  }
}

// http(s) proxy
Proxy.prototype.defaultRequest = function(p, req) {
  var that = this

  var opts = this.getOpts(p)
      opts.headers = req.headers

  require(this.protocol).request(opts, function(res) {
    var len = 0
    var bufferDatas = [];
    res.on('data', function(data) {
      bufferDatas.push(data)
      len += data.length
    })

    res.on('end', function() {
      var buffer = Buffer.concat(bufferDatas, len)
      that.requestCb(p, {
        statusCode: res.statusCode,
        headers: res.headers,
        body: buffer
      })
    })

  }).on('error', function(err) {
    that.requestCb(p, {
      statusCode: 500,
      body: err
    })
  }).end()
}

// common proxy request callback
Proxy.prototype.requestCb = function(p, info) {
  var status = info.statusCode
  var orderId = this.order.id
  var infoDetail = {orderId: orderId, path: p, status: status}

  if (status < 200 || 400 <= status) {
    this.order.report({
      action: 'warn',
      info: ['Proxy response error', infoDetail]
    })
  } else {
    this.order.report({
      action: 'debug',
      info: ['Proxy response', infoDetail]
    })
    info.body = this.decorate(p, info.body)
  }

  this.cache[p].resolve(info)
}


// process proxy return, such as adapt runner, insert cov code, etc
Proxy.prototype.decorate = function(p, buffer) {
  var order = this.order
  var orderId = order.id
  var runner = order.parsedRunner.path
  var charset
  var str
  var infoDetail = {orderId: orderId, path: p}

  if (runner === p) {
    charset = order.config.charset || detectCharset(buffer)
    str = iconv.decode(buffer, charset)

    var rt = adapt(orderId, str, order.config.adapter)
    if (rt instanceof Error) {
      infoDetail.message = rt.message
      order.report({
        action: 'error',
        info: ['Adapter error.', infoDetail]
      })
      return ''
    } else {
      return iconv.encode(rt, charset)
    }

  } else if (isSrc(p, runner)) {
    charset = order.config.charset || detectCharset(buffer)
    str = iconv.decode(buffer, charset)
    if (order.config.coverage) {
      try {
        str = jscoverage.process(p, str)
      } catch(e) {
        logger.error('An error occured when insert cov code', infoDetail)
      }
    }

    order.report({
      action: 'debug',
      info: ['Insert coverage code', infoDetail]
    })
    return iconv.encode(str, charset)

  } else {
    return buffer
  }
}

Proxy.prototype.getOpts = function(p, method) {
  var order = this.order
  var parsedRunner = order.parsedRunner

  return {
    hostname: parsedRunner.hostname,
    port: parsedRunner.port,
    path: p,
    method: method || 'get'
  }
}


var charsetReg = /charset\s*=\s*['"]([-\w]+)\s*['"]/
function detectCharset(buf) {
  var str = iconv.decode(buf).slice(0, 1000)
  var matcher = str.match(charsetReg)

  if (matcher) return matcher[1]
  return 'utf-8'
}


function isSrc(p, runner) {
  var projPath = path.join(path.dirname(runner), '..')
  var pathRelToProj = path.relative(projPath, p)
  var reg = /^(src|lib|dist|build)\//i
  return reg.test(pathRelToProj) && path.extname(p) === '.js'
}
