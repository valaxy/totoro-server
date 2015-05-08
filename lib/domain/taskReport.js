// <<Entity>>
modules.exports = function () {
  return {
    orderId: '',  // identity
    action: '',   // end | onerror | log | timeout todo: Ã»ÓÐtimeoutÂð?
    laborId: '',
    info: {
      errors: [],
      customLogs: [],
      failures: [],
      stats: {} // diy
    }
  }
}