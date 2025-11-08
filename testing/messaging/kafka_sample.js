// kafka_sample.js

function publishOrder(order) {
  const topic = 'orders.topic'
  // simulate produce
  console.log('produce to', topic, order)
  // produce
}

function consumeOrder() {
  const topic = 'orders.topic'
  // simulate subscribe
  console.log('subscribe', topic)
  // consume
}

module.exports = { publishOrder, consumeOrder } 