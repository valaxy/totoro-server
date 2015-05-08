// <<Entity>>
var Task = function (options) {
  //this.laborId = options.laborId
  //this.laborTrait = options.laborTrait
  this.orderId = options.orderId // the task id
  this.runner = options.runner   // runner url
  //this.url = options.url
}

module.exports = Task