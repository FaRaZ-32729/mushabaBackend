const express = require("express");
const {
    getUserById,
    updateUser,
    updateProfile,
    deleteUser,
    checkUserStatus
} = require("../controllers/userController");

const router = express.Router();

router.post("/status", checkUserStatus)
router.get("/single/:id", getUserById)
router.put("/update-user/:id", updateUser)
router.put("/update-profile/:userId", updateProfile)
router.delete("/delete/:id  ", deleteUser)