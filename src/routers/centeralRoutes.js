const express = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const connectionRoutes = require("./connectionRoutes");
const notificationRoutes = require("./notificationRoutes");
const chatRoutes = require("./chatRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/connections", connectionRoutes);
router.use("/notifications", notificationRoutes);
router.use("/chats", chatRoutes);

module.exports = router;