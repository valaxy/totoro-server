// <<Entity>>
modules.exports = function () {
  return {
    orderId: '',  // identity
    action: '',   // end | onerror | log | timeout todo: û��timeout��?
    laborId: '',
    info: {
      errors: [],
      customLogs: [],
      failures: [],
      stats: {} // diy
    }
  }
}