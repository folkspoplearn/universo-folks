// Função da Vercel: todas as rotas (vercel.json -> rewrites) caem aqui e vão para a API Nest
// compilada em dist/ pelo "npm run vercel-build". Fora da Vercel, use dist/main.js.
module.exports = require('../dist/serverless').default;
