class ResponseModel {
  constructor(success = false, message = "", data = null) {
    this.success = success;
    this.message = message;
    this.data = data;
  }
}

module.exports = ResponseModel;
