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
const meshRoutes = require("./meshRoutes");
const speechRoute = require("./speechRoute");
const translateRoutes = require("./translateRoutes");
const ttsRoutes = require("./ttsRoutes");
const pipelineRoutes = require("./pipelineRoutes");

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
console.warn('[SERVER_DEBUG] Personal pin location routes registered at /api/personal-pin-locations');
console.warn('🚀🚀🚀 PERSONAL PIN LOCATION ROUTES ARE LOADED! 🚀🚀🚀');
router.use("/mesh", meshRoutes);
router.use("/stt", speechRoute);
router.use("/translate", translateRoutes);
router.use("/tts", ttsRoutes);
router.use("/pipeline", pipelineRoutes);

module.exports = router;