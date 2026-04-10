const user = localStorage.getItem('user');
const token = localStorage.getItem('access_token');
console.log('User:', user);
console.log('Token:', token);
console.log('Is authenticated:', !!user);
