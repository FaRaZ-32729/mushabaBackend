const express = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const connectionRoutes = require("./connectionRoutes");
const notificationRoutes = require("./notificationRoutes");
const chatRoutes = require("./chatRoutes");
const messageRoutes = require("./messageRoutes");
const uploadRoutes = require("./uploadRoutes");
const locationRoutes = require("./locationRoutes");
const pinLocationRoutes = require("./pinLocationRoutes");
const personalPinLocationRoutes = require("./personalPinLocationRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/connections", connectionRoutes);
router.use("/notifications", notificationRoutes);
router.use("/chats", chatRoutes);
router.use("/messages", messageRoutes);
router.use("/upload", uploadRoutes);
router.use("/location", locationRoutes);
router.use("/pin-locations", pinLocationRoutes);
router.use("/personal-pin-locations", personalPinLocationRoutes);

module.exports = router;