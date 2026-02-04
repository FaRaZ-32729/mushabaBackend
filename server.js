const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser")
const http = require('http');
const path = require('path');
require("dotenv").config();
const DB_Connection = require("./config/dbConnection");
const centeralRoutes = require("./src/routers/centeralRoutes")


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
app.use("/api", centeralRoutes)

// Server 
app.listen(PORT, () => {
    console.log(`MUSHABA Server is running on port : ${PORT}`);
})