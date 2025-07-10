const express = require('express');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const cors = require('cors');
const requestTracker = require('./utils/requestTracker');

const app = express();
const PORT = process.env.PORT || 4000;

app.enable("trust proxy");
app.set("json spaces", 2);

// Middleware to parse JSON and URL-encoded bodies, ensuring req.body is available for POST APIs
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// Serve static files from the "web" folder
app.use('/', express.static(path.join(__dirname, 'web')));

// Expose settings.json at the root
app.get('/settings.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'settings.json'));
});

// Load settings for middleware
const settingsPath = path.join(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// Middleware to augment JSON responses, compatible with users.js responses
app.use((req, res, next) => {
  const originalJson = res.json;
  const originalSend = res.send;
  const originalEnd = res.end;
  
  res.json = function (data) {
    if (data && typeof data === 'object') {
      const responseData = {
        status: data.status,
        operator: (settings.apiSettings && settings.apiSettings.operator) || "Created Using Rynn UI",
        ...data
      };
      return originalJson.call(this, responseData);
    }
    return originalJson.call(this, data);
  };
  
  // Track successful API requests
  const trackRequest = () => {
    if (req.path.startsWith('/api/') && res.statusCode < 400) {
      const apiPath = req.path.replace('/api', '');
      requestTracker.trackRequest(apiPath, req.method);
    }
  };
  
  // Override response methods to track requests
  res.json = function(data) {
    trackRequest();
    return originalJson.call(this, data);
  };
  
  res.send = function(data) {
    trackRequest();
    return originalSend.call(this, data);
  };
  
  res.end = function(data) {
    trackRequest();
    return originalEnd.call(this, data);
  };
  
  next();
});

// Load API modules from the "api" folder and its subfolders recursively
const apiFolder = path.join(__dirname, 'api');
let totalRoutes = 0;
const apiModules = [];

// Recursive function to load modules
const loadModules = (dir) => {
  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      loadModules(filePath); // Recurse into subfolder
    } else if (fs.statSync(filePath).isFile() && path.extname(file) === '.js') {
      try {
        const module = require(filePath);
        // Validate module structure expected by index.js
        if (!module.meta || !module.onStart || typeof module.onStart !== 'function') {
          console.warn(chalk.bgHex('#FF9999').hex('#333').bold(`Invalid module in ${filePath}: Missing or invalid meta/onStart`));
          return;
        }

        const basePath = module.meta.path.split('?')[0];
        const routePath = '/api' + basePath; // Prepends /api, compatible with users.js path
        const method = (module.meta.method || 'get').toLowerCase(); // Handles 'post' from users.js
        app[method](routePath, (req, res) => {
          console.log(chalk.bgHex('#99FF99').hex('#333').bold(`Handling ${method.toUpperCase()} request for ${routePath}`));
          module.onStart({ req, res }); // Passes req and res to users.js onStart
        });
        apiModules.push({
          name: module.meta.name,
          description: module.meta.description,
          category: module.meta.category,
          path: routePath + (module.meta.path.includes('?') ? '?' + module.meta.path.split('?')[1] : ''),
          author: module.meta.author,
          method: module.meta.method || 'get',
          basePath: basePath // Store the base path for request tracking
        });
        totalRoutes++;
        console.log(chalk.bgHex('#FFFF99').hex('#333').bold(`Loaded Route: ${module.meta.name} (${method.toUpperCase()})`));
      } catch (error) {
        console.error(chalk.bgHex('#FF9999').hex('#333').bold(`Error loading module ${filePath}: ${error.message}`));
      }
    }
  });
};

loadModules(apiFolder);

console.log(chalk.bgHex('#90EE90').hex('#333').bold('Load Complete! ✓'));
console.log(chalk.bgHex('#90EE90').hex('#333').bold(`Total Routes Loaded: ${totalRoutes}`));

// Endpoint to expose API metadata
app.get('/api/info', (req, res) => {
  const categories = {};
  const requestCounts = requestTracker.getAllRequestCounts();
  
  apiModules.forEach(module => {
    if (!categories[module.category]) {
      categories[module.category] = { name: module.category, items: [] };
    }
    
    // Get request count for this endpoint
    const requestKey = `${module.method.toUpperCase()} ${module.basePath}`;
    const requestCount = requestCounts[requestKey] || 0;
    
    categories[module.category].items.push({
      name: module.name,
      desc: module.description,
      path: module.path,
      author: module.author,
      method: module.method,
      requestCount: requestCount
    });
  });
  
  res.json({ 
    categories: Object.values(categories),
    statistics: requestTracker.getStatistics()
  });
});

// New endpoint to get request statistics
app.get('/api/stats', (req, res) => {
  res.json(requestTracker.getStatistics());
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'portal.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'docs.html'));
});

// 404 error handler
app.use((req, res) => {
  console.log(`404 Not Found: ${req.url}`);
  res.status(404).sendFile(path.join(__dirname, 'web', '404.html'));
});

// 500 error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, 'web', '500.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(chalk.bgHex('#90EE90').hex('#333').bold(`Server is running on port ${PORT}`));
});

module.exports = app;