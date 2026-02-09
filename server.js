const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser")
const http = require('http');
const path = require('path');
require("dotenv").config();
const DB_Connection = require("./config/dbConnection");
const centeralRoutes = require("./src/routers/centeralRoutes");
const qrUsersController = require('./src/controllers/qrUsersController');
const cleanupService = require("./src/services/cleanupService");
const locationController = require('./src/controllers/locationController');


DB_Connection();
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;


// Default Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Routes
app.use("/api", centeralRoutes);

// Dynamic QR HTML route - serves QR user data as HTML
app.get('/qr/:userId', (req, res) => {
    qrUsersController.getQRUserHTML(req, res);
});

// Start memory cleanup service
const startMemoryCleanup = () => {
    setInterval(() => {
        if (locationController.cleanupStaleMemoryLocations) {
            locationController.cleanupStaleMemoryLocations();
        }
    }, 15000); // Check every 15 seconds for more responsive cleanup
    console.log('[MEMORY_CLEANUP] Started memory cleanup service (15s interval)');
};

// Start background cleanup service for expired pin locations
cleanupService.start();
console.log('[CLEANUP_SERVICE] Started background cleanup service');

startMemoryCleanup();


// Server 
app.listen(PORT, () => {
    console.log(`MUSHABA Server is running on port : ${PORT}`);
})