(function () {
  if (typeof console === 'undefined') {
    console = {
      log: function () {
        var el = document.createElement('div')
        el.innerHTML = [].slice.call(arguments, 0).join(' ')
        document.body.appendChild(el)

        setTimeout(function () {
          document.body.removeChild(el)
        }, 30 * 1000)
      }
    }
  }

  function Driver() {
    var that = this
    var socket = this.socket = io.connect('/__labor')

    this.orders = {}

    socket.on('connect', function () {
      console.log('Connect')
      socket.emit('init', navigator.userAgent)
    })

    socket.on('disconnect', function () {
      console.log('Disconnect')
      for (var orderKey in that.orders) {
        that.remove(orderKey)
      }
    })

    socket.on('add', function (task) {
      that.add(task)
      console.log(task)
    })


    socket.on('remove', function (task) {
      that.remove(task)
    })
  }


  // add a task
  Driver.prototype.add = function (data) {
    var runner = data.runner

    var iframe
    iframe = document.createElement('iframe')
    iframe.src = runner
    document.getElementsByClassName('everything')[0].appendChild(iframe)

    var orderKey = data.orderId + '-' + data.laborId
    this.orders[orderKey] = iframe

    console.log('Add order <', runner, '>')
  }

  Driver.prototype.remove = function (data) {
    var orderKey
    // when socket disconnect, will pass order key in to close all runners
    if (typeof data === 'string' && data in this.orders) {
      orderKey = data
    } else {
      orderKey = data.orderId + '-' + data.laborId
    }

    var el = this.orders[orderKey]

    if (el) {
      delete this.orders[orderKey]

      if (el.nodeName) {
        document.getElementsByClassName('everything')[0].removeChild(el)
      } else {
        el.close()
      }

      console.log('Remove order <', orderKey, '>')
    }
  }


  var driver = new Driver()
})()
