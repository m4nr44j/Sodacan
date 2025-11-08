// grpc_client.js
const grpc = require('@grpc/grpc-js')

function callService(client) {
  // new grpc client pattern
  const req = { id: '123' }
  client.getUser(req, (err, res) => {
    if (err) console.error(err)
    else console.log(res)
  })
}

module.exports = { callService } 