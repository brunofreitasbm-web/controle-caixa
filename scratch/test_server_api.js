require('dotenv').config();
const app = require('../server');
const http = require('http');

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  console.log(`Server listening on test port ${port}`);

  http.get(`http://localhost:${port}/api/registros`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(`API returned ${json.length} records.`);
        console.log('Sample record 0:', json[0]);
        console.log('Sample record last:', json[json.length - 1]);
      } catch (err) {
        console.error('Error parsing JSON response:', err);
      } finally {
        server.close();
      }
    });
  }).on('error', (err) => {
    console.error('HTTP request error:', err);
    server.close();
  });
});
