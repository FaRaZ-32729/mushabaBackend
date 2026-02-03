const express = require("express");
const cors = require("cors");
const http = require('http');
require("dotenv").config();
const DB_Connection = require("./config/dbConnection");


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


// Server 
app.listen( PORT , ()=> {
    console.log(`MUSHABA Server is running on port : ${PORT}`);
})