const express = require("express");
const {
    getUserById,
    updateProfile,
    deleteUser,
    checkUserStatus,
    getAllUsers,
    updateUserStatus
} = require("../controllers/userController");
const { protect } = require("../middleweres/protect");

const router = express.Router();

router.use(protect);

// Check and fix user status for socket connection
router.post("/check-status", checkUserStatus);
// Get all users
router.get("/", getAllUsers);
// Get user by ID
router.get("/:userId", getUserById);
// Update user status
router.put("/status", updateUserStatus);
// Update user profile
router.put("/profile", updateProfile);
// Delete user account (POST, allows body)
router.post("/delete-account", deleteUser);

module.exports = router; 