// sample.js
const express = require('express');

// Traditional function declaration
function processData(data) {
  return data.map(item => item.id);
}

// Arrow function
const fetchAPI = async (url) => {
  const response = await fetch(url);
  return response.json();
};

// ES6 Class
class UserManager {
  constructor() {
    this.users = [];
  }

  addUser(user) {
    this.users.push(user);
  }
}

// Export for module system
module.exports = { processData, fetchAPI, UserManager }; 