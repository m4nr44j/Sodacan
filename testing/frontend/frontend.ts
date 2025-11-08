// frontend.ts
async function fetchUsers() {
    const response = await fetch('/api/users');
    const users = await response.json();
    return users;
  }